/*
zlib/deflate - deflate internal controller
Part of Stardazed
(c) 2018-Present by Arthur Langereis - @zenmumbler
https://github.com/stardazed/sd-zlib

Based on zip.js (c) 2013 by Gildas Lormeau
Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
*/

import { ZDeflateHeap, ZStatus, ZFlush, ZStrategy, ZLimits } from "./common";
import { Tree, StaticTree, L_CODES, D_CODES, BL_CODES, HEAP_SIZE, LITERALS } from "./deftree";
import { ZStream, ZPendingBuffer } from "./zstream";
import { config_table, ZFunc } from "./defconfig";

function smaller(tree: ArrayLike<number>, n: number, m: number, depth: ArrayLike<number>) {
	const tn2 = tree[n * 2];
	const tm2 = tree[m * 2];
	return (tn2 < tm2 || (tn2 == tm2 && depth[n] <= depth[m]));
}

const enum BState {
	/** block not completed, need more input or more output */
	NeedMore = 0,
	/** block flush performed */
	BlockDone = 1,
	/** finish started, need only more output at next deflate */
	FinishStarted = 2,
	/** finish done, accept no more input or output */
	FinishDone = 3
}

const END_BLOCK = 256;

// repeat previous bit length 3-6 times (2 bits of repeat count)
const REP_3_6 = 16;
// repeat a zero length 3-10 times (3 bits of repeat count)
const REPZ_3_10 = 17;
// repeat a zero length 11-138 times (7 bits of repeat count)
const REPZ_11_138 = 18;

export const enum DeflateState {
	INIT = 1,
	BUSY = 2,
	FINISH = 3
}

const STORED_BLOCK = 0;
const STATIC_TREES = 1;
const DYN_TREES = 2;

const MIN_MATCH = 3;
const MAX_MATCH = 258;
const MIN_LOOKAHEAD = (MAX_MATCH + MIN_MATCH + 1);

// --------------------------
// [AL] the following were configurable, no more
const enum DC {
	w_bits = 15, // log2(DC.w_size) (8..16)
	w_size = 1 << w_bits, // LZ77 window size (32K by default)
	w_mask = DC.w_size - 1,
}

const hash_bits = 8 + 7; // memLevel (9) + 7
const hash_size = 1 << hash_bits;
const hash_mask = hash_size - 1;
// Number of bits by which ins_h must be shifted at each input
// step. It must be such this after MIN_MATCH steps, the oldest
// byte no longer takes part in the hash key, this is:
// hash_shift * MIN_MATCH >= hash_bits
const hash_shift = Math.floor((hash_bits + MIN_MATCH - 1) / MIN_MATCH);

// Size of match buffer for literals/lengths. There are 4 reasons for
// limiting lit_bufsize to 64K:
// - frequencies can be kept in 16 bit counters
// - if compression is not successful for the first block, all input
// data is still in the window so we can still emit a stored block even
// when input comes from standard input. (This can also be done for
// all blocks if lit_bufsize is not greater than 32K.)
// - if compression is not successful for a file smaller than 64K, we can
// even emit a stored file instead of a stored block (saving 5 bytes).
// This is applicable only for zip (not gzip or zlib).
// - creating new Huffman trees less frequently may not provide fast
// adaptation to changes in the input data statistics. (Take for
// example a binary file with poorly compressible code followed by
// a highly compressible string table.) Smaller buffer sizes give
// fast adaptation but have of course the overhead of transmitting
// trees more frequently.
// - I can't count above 4
const lit_bufsize = 1 << (8 + 6); // 16K elements by default (9 is memLevel)
// We overlay pending_buf and d_buf+l_buf. This works since the average
// output size for (length,distance) codes is <= 24 bits.
const pending_buf_size = lit_bufsize * 4;
const d_buf = Math.floor(lit_bufsize / 2);
const l_buf = (1 + 2) * lit_bufsize; // index for literals or lengths

// Actual size of window: 2*wSize, except when the user input buffer
// is directly used as sliding window.
const window_size = 2 * DC.w_size;


export class Deflate implements ZDeflateHeap, ZPendingBuffer {
	strm: ZStream;
	status = DeflateState.INIT;

	pending_buf = new Uint8Array(pending_buf_size); // output still pending
	pending = 0; // nb of bytes in the pending buffer
	pending_out = 0; // next pending byte to output to the stream

	last_flush = ZFlush.NO_FLUSH; // value of flush param for previous deflate call

	// Sliding window. Input bytes are read into the second half of the window,
	// and move to the first half later to keep a dictionary of at least wSize
	// bytes. With this organization, matches are limited to a distance of
	// wSize-MAX_MATCH bytes, but this ensures this IO is always
	// performed with a length multiple of the block size. Also, it limits
	// the window size to 64K, which is quite useful on MSDOS.
	// To do: use the user input buffer as sliding window.
	window = new Uint8Array(window_size);

	prev = new Uint16Array(DC.w_size);
	// Link to older string with same hash index. To limit the size of this
	// array to 64K, this link is maintained only for the last 32K strings.
	// An index in this array is thus a window index modulo 32K.

	head = new Uint16Array(hash_size); // Heads of the hash chains or NIL.

	ins_h = 0; // hash index of string to be inserted

	// Window position at the beginning of the current output block. Gets
	// negative when the window is moved backwards.
	block_start = 0;

	match_length = MIN_MATCH - 1; // length of best match
	match_available = false; // set if previous match exists
	strstart = 0; // start of string to insert
	match_start = 0; // start of matching string
	lookahead = 0; // number of valid bytes ahead in window
	// Length of the best match at previous step. Matches not greater than this
	// are discarded. This is used in the lazy match evaluation.
	prev_length = MIN_MATCH - 1;

	// Insert new strings in the hash table only if the match length is not
	// greater than this length. This saves time but degrades compression.
	// max_insert_length is used only for compression levels <= 3.

	level: number; // compression level (1..9)
	strategy: ZStrategy; // favor or force Huffman coding

	// Use a faster search when the previous match is longer than this
	good_match: number;
	// Stop searching when current match exceeds this
	nice_match: number;
	// To speed up deflation, hash chains are never searched beyond this
	// length. A higher limit improves compression ratio but degrades the speed.
	max_chain_length: number;
	// Attempt to find a better match only when the current match is strictly
	// smaller than this value. This mechanism is used only for compression
	// levels >= 4.
	max_lazy_match: number;

	dyn_ltree = new Uint16Array(HEAP_SIZE * 2); // literal and length tree
	dyn_dtree = new Uint16Array((2 * D_CODES + 1) * 2); // distance tree
	bl_tree = new Uint16Array((2 * BL_CODES + 1) * 2); // Huffman tree for bit lengths

	l_desc = new Tree(this.dyn_ltree, StaticTree.static_l_desc); // desc for literal tree
	d_desc = new Tree(this.dyn_dtree, StaticTree.static_d_desc); // desc for distance tree
	bl_desc = new Tree(this.bl_tree, StaticTree.static_bl_desc); // desc for bit length tree

	// Depth of each subtree used as tie breaker for trees of equal frequency
	public depth = new Uint16Array(2 * L_CODES + 1);

	last_lit = 0; // running index in l_buf
	matches = 0; // number of string matches in current block
	public opt_len = 0; // bit length of current block with optimal trees
	public static_len = 0; // bit length of current block with static trees

	last_eob_len = 8; // bit length of EOB code for last block

	// Output buffer. bits are inserted starting at the bottom (least
	// significant bits).
	bi_buf = 0;

	// Number of valid bits in bi_buf. All bits above the last valid bit
	// are always zero.
	bi_valid = 0;

	// number of codes at each bit length for an optimal tree
	public bl_count = new Uint16Array(ZLimits.MAX_BITS + 1);

	// heap used to build the Huffman trees
	public heap = new Uint16Array(2 * L_CODES + 1);
	public heap_len = 0;
	public heap_max = HEAP_SIZE;

	constructor(strm: ZStream, level = 6, strategy = ZStrategy.DEFAULT_STRATEGY) {
		if (level < 0 || level > 9 || strategy < 0 || strategy > ZStrategy.HUFFMAN_ONLY) {
			throw RangeError("level or strategy is out of range");
		}

		this.strm = strm;
		this.level = level;
		this.strategy = strategy;

		strm.msg = "";
		strm.total_in = strm.total_out = 0;

		// Initialize the first block of the first file:
		this.init_block();

		for (let i = 0; i < hash_size; ++i) {
			this.head[i] = 0;
		}

		// Set the default configuration parameters:
		this.max_lazy_match = config_table[level].max_lazy;
		this.good_match = config_table[level].good_length;
		this.nice_match = config_table[level].nice_length;
		this.max_chain_length = config_table[level].max_chain;
	}

	private init_block() {
		// Initialize the trees.
		for (let i = 0; i < L_CODES; i++)
			this.dyn_ltree[i * 2] = 0;
		for (let i = 0; i < D_CODES; i++)
			this.dyn_dtree[i * 2] = 0;
		for (let i = 0; i < BL_CODES; i++)
			this.bl_tree[i * 2] = 0;

		this.dyn_ltree[END_BLOCK * 2] = 1;
		this.opt_len = this.static_len = 0;
		this.last_lit = this.matches = 0;
	}

	// Restore the heap property by moving down the tree starting at node k,
	// exchanging a node with the smallest of its two sons if necessary,
	// stopping
	// when the heap property is re-established (each father smaller than its
	// two sons).
	pqdownheap(tree: Uint16Array, // the tree to restore
		k: number // node to move down
	) {
		const heap = this.heap;
		const v = heap[k];
		let j = k << 1; // left son of k
		while (j <= this.heap_len) {
			// Set j to the smallest of the two sons:
			if (j < this.heap_len && smaller(tree, heap[j + 1], heap[j], this.depth)) {
				j++;
			}
			// Exit if v is smaller than both sons
			if (smaller(tree, v, heap[j], this.depth))
				break;

			// Exchange v with the smallest son
			heap[k] = heap[j];
			k = j;
			// And continue down the tree, setting j to the left son of k
			j <<= 1;
		}
		heap[k] = v;
	};

	// Scan a literal or distance tree to determine the frequencies of the codes
	// in the bit length tree.
	private scan_tree(tree: Uint16Array,// the tree to be scanned
		max_code: number // and its largest code of non zero frequency
	) {
		var prevlen = -1; // last emitted length
		var curlen; // length of current code
		var nextlen = tree[0 * 2 + 1]; // length of next code
		var count = 0; // repeat count of the current code
		var max_count = 7; // max repeat count
		var min_count = 4; // min repeat count

		if (nextlen === 0) {
			max_count = 138;
			min_count = 3;
		}
		tree[(max_code + 1) * 2 + 1] = 0xffff; // guard

		for (let n = 0; n <= max_code; n++) {
			curlen = nextlen;
			nextlen = tree[(n + 1) * 2 + 1];
			if (++count < max_count && curlen == nextlen) {
				continue;
			} else if (count < min_count) {
				this.bl_tree[curlen * 2] += count;
			} else if (curlen !== 0) {
				if (curlen != prevlen)
					this.bl_tree[curlen * 2]++;
				this.bl_tree[REP_3_6 * 2]++;
			} else if (count <= 10) {
				this.bl_tree[REPZ_3_10 * 2]++;
			} else {
				this.bl_tree[REPZ_11_138 * 2]++;
			}
			count = 0;
			prevlen = curlen;
			if (nextlen === 0) {
				max_count = 138;
				min_count = 3;
			} else if (curlen == nextlen) {
				max_count = 6;
				min_count = 3;
			} else {
				max_count = 7;
				min_count = 4;
			}
		}
	}

	// Construct the Huffman tree for the bit lengths and return the index in
	// bl_order of the last bit length code to send.
	private build_bl_tree() {
		// Determine the bit length frequencies for literal and distance trees
		this.scan_tree(this.dyn_ltree, this.l_desc.max_code);
		this.scan_tree(this.dyn_dtree, this.d_desc.max_code);

		// Build the bit length tree:
		this.bl_desc.build_tree(this);
		// opt_len now includes the length of the tree representations, except
		// the lengths of the bit lengths codes and the 5+5+4 bits for the
		// counts.

		// Determine the number of bit length codes to send. The pkzip format
		// requires this at least 4 bit length codes be sent. (appnote.txt says
		// 3 but the actual value used is 4.)
		let max_blindex; // index of last bit length code of non zero freq
		for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
			if (this.bl_tree[Tree.bl_order[max_blindex] * 2 + 1] !== 0)
				break;
		}
		// Update opt_len to include the bit length tree and counts
		this.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;

		return max_blindex;
	}

	// Output a byte on the stream.
	// IN assertion: there is enough room in pending_buf.
	private put_byte(b: number) {
		this.pending_buf[this.pending++] = b;
	}

	private put_short(w: number) {
		this.pending_buf[this.pending++] = w & 0xff;
		this.pending_buf[this.pending++] = (w >>> 8) & 0xff;
	}

	private send_bits(value: number, length: number) {
		if (this.bi_valid > 16 - length) {
			// bi_buf |= (val << bi_valid);
			this.bi_buf |= ((value << this.bi_valid) & 0xffff);
			this.put_short(this.bi_buf);
			this.bi_buf = value >>> (16 - this.bi_valid);
			this.bi_valid += length - 16;
		} else {
			this.bi_buf |= ((value << this.bi_valid) & 0xffff);
			this.bi_valid += length;
		}
	}

	private send_code(c: number, tree: Uint16Array) {
		const c2 = c * 2;
		this.send_bits(tree[c2] & 0xffff, tree[c2 + 1] & 0xffff);
	}

	// Send a literal or distance tree in compressed form, using the codes in
	// bl_tree.
	private send_tree(tree: Uint16Array,// the tree to be sent
		max_code: number // and its largest code of non zero frequency
	) {
		var prevlen = -1; // last emitted length
		var curlen; // length of current code
		var nextlen = tree[0 * 2 + 1]; // length of next code
		var count = 0; // repeat count of the current code
		var max_count = 7; // max repeat count
		var min_count = 4; // min repeat count

		if (nextlen === 0) {
			max_count = 138;
			min_count = 3;
		}

		for (let n = 0; n <= max_code; n++) {
			curlen = nextlen;
			nextlen = tree[(n + 1) * 2 + 1];
			if (++count < max_count && curlen == nextlen) {
				continue;
			} else if (count < min_count) {
				do {
					this.send_code(curlen, this.bl_tree);
				} while (--count !== 0);
			} else if (curlen !== 0) {
				if (curlen != prevlen) {
					this.send_code(curlen, this.bl_tree);
					count--;
				}
				this.send_code(REP_3_6, this.bl_tree);
				this.send_bits(count - 3, 2);
			} else if (count <= 10) {
				this.send_code(REPZ_3_10, this.bl_tree);
				this.send_bits(count - 3, 3);
			} else {
				this.send_code(REPZ_11_138, this.bl_tree);
				this.send_bits(count - 11, 7);
			}
			count = 0;
			prevlen = curlen;
			if (nextlen === 0) {
				max_count = 138;
				min_count = 3;
			} else if (curlen == nextlen) {
				max_count = 6;
				min_count = 3;
			} else {
				max_count = 7;
				min_count = 4;
			}
		}
	}

	// Send the header for a block using dynamic Huffman trees: the counts, the
	// lengths of the bit length codes, the literal tree and the distance tree.
	// IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
	private send_all_trees(lcodes: number, dcodes: number, blcodes: number) {
		this.send_bits(lcodes - 257, 5); // not +255 as stated in appnote.txt
		this.send_bits(dcodes - 1, 5);
		this.send_bits(blcodes - 4, 4); // not -3 as stated in appnote.txt
		for (let rank = 0; rank < blcodes; rank++) {
			this.send_bits(this.bl_tree[Tree.bl_order[rank] * 2 + 1], 3);
		}
		this.send_tree(this.dyn_ltree, lcodes - 1); // literal tree
		this.send_tree(this.dyn_dtree, dcodes - 1); // distance tree
	}

	// Flush the bit buffer, keeping at most 7 bits in it.
	private bi_flush() {
		if (this.bi_valid === 16) {
			this.put_short(this.bi_buf);
			this.bi_buf = 0;
			this.bi_valid = 0;
		} else if (this.bi_valid >= 8) {
			this.put_byte(this.bi_buf & 0xff);
			this.bi_buf >>>= 8;
			this.bi_valid -= 8;
		}
	}

	// Send one empty static block to give enough lookahead for inflate.
	// This takes 10 bits, of which 7 may remain in the bit buffer.
	// The current inflate code requires 9 bits of lookahead. If the
	// last two codes for the previous block (real code plus EOB) were coded
	// on 5 bits or less, inflate may have only 5+3 bits of lookahead to decode
	// the last real code. In this case we send two empty static blocks instead
	// of one. (There are no problems if the previous block is stored or fixed.)
	// To simplify the code, we assume the worst case of last real code encoded
	// on one bit only.
	private _tr_align() {
		this.send_bits(STATIC_TREES << 1, 3);
		this.send_code(END_BLOCK, StaticTree.static_ltree);

		this.bi_flush();

		// Of the 10 bits for the empty block, we have already sent
		// (10 - bi_valid) bits. The lookahead for the last real code (before
		// the EOB of the previous block) was thus at least one plus the length
		// of the EOB plus what we have just sent of the empty static block.
		if (1 + this.last_eob_len + 10 - this.bi_valid < 9) {
			this.send_bits(STATIC_TREES << 1, 3);
			this.send_code(END_BLOCK, StaticTree.static_ltree);
			this.bi_flush();
		}
		this.last_eob_len = 7;
	}

	// Save the match info and tally the frequency counts. Return true if
	// the current block must be flushed.
	private _tr_tally(dist: number, // distance of matched string
		lc: number // match length-MIN_MATCH or unmatched char (if dist==0)
	) {
		this.pending_buf[d_buf + this.last_lit * 2] = (dist >>> 8) & 0xff;
		this.pending_buf[d_buf + this.last_lit * 2 + 1] = dist & 0xff;

		this.pending_buf[l_buf + this.last_lit] = lc & 0xff;
		this.last_lit++;

		if (dist === 0) {
			// lc is the unmatched char
			this.dyn_ltree[lc * 2]++;
		} else {
			this.matches++;
			// Here, lc is the match length - MIN_MATCH
			dist--; // dist = match distance - 1
			this.dyn_ltree[(Tree._length_code[lc] + LITERALS + 1) * 2]++;
			this.dyn_dtree[Tree.d_code(dist) * 2]++;
		}

		if ((this.last_lit & 0x1fff) === 0 && this.level > 2) {
			// Compute an upper bound for the compressed length
			let out_length = this.last_lit * 8;
			let in_length = this.strstart - this.block_start;
			for (let dcode = 0; dcode < D_CODES; dcode++) {
				out_length += this.dyn_dtree[dcode * 2] * (5 + Tree.extra_dbits[dcode]);
			}
			out_length >>>= 3;
			if ((this.matches < Math.floor(this.last_lit / 2)) && out_length < Math.floor(in_length / 2))
				return true;
		}

		return (this.last_lit === lit_bufsize - 1);
		// We avoid equality with lit_bufsize because of wraparound at 64K
		// on 16 bit machines and because stored blocks are restricted to
		// 64K-1 bytes.
	}

	// Send the block data compressed using the given Huffman trees
	private compress_block(ltree: Uint16Array, dtree: Uint16Array) {
		// var dist; // distance of matched string
		// var lc; // match length or unmatched char (if dist === 0)
		let lx = 0; // running index in l_buf
		// var code; // the code to send
		// var extra; // number of extra bits to send

		if (this.last_lit !== 0) {
			do {
				let dist = ((this.pending_buf[d_buf + lx * 2] << 8) & 0xff00) | (this.pending_buf[d_buf + lx * 2 + 1] & 0xff);
				let lc = (this.pending_buf[l_buf + lx]) & 0xff;
				lx++;

				if (dist === 0) {
					this.send_code(lc, ltree); // send a literal byte
				} else {
					// Here, lc is the match length - MIN_MATCH
					let code = Tree._length_code[lc];

					this.send_code(code + LITERALS + 1, ltree); // send the length
					// code
					let extra = Tree.extra_lbits[code];
					if (extra !== 0) {
						lc -= Tree.base_length[code];
						this.send_bits(lc, extra); // send the extra length bits
					}
					dist--; // dist is now the match distance - 1
					code = Tree.d_code(dist);

					this.send_code(code, dtree); // send the distance code
					extra = Tree.extra_dbits[code];
					if (extra !== 0) {
						dist -= Tree.base_dist[code];
						this.send_bits(dist, extra); // send the extra distance bits
					}
				} // literal or match pair ?

				// Check this the overlay between pending_buf and d_buf+l_buf is
				// ok:
			} while (lx < this.last_lit);
		}

		this.send_code(END_BLOCK, ltree);
		this.last_eob_len = ltree[END_BLOCK * 2 + 1];
	}

	// Flush the bit buffer and align the output on a byte boundary
	private bi_windup() {
		if (this.bi_valid > 8) {
			this.put_short(this.bi_buf);
		} else if (this.bi_valid > 0) {
			this.put_byte(this.bi_buf & 0xff);
		}
		this.bi_buf = 0;
		this.bi_valid = 0;
	}

	// Copy a stored block, storing first the length and its
	// one's complement if requested.
	private copy_block(buf: number, // the input data
		len: number, // its length
		header: boolean // true if block header must be written
	) {
		this.bi_windup(); // align on byte boundary
		this.last_eob_len = 8; // enough lookahead for inflate

		if (header) {
			this.put_short(len);
			this.put_short(~len);
		}

		this.pending_buf.set(this.window.subarray(buf, buf + len), this.pending);
		this.pending += len;
	}

	// Send a stored block
	private _tr_stored_block(buf: number, // input block
		stored_len: number, // length of input block
		eof: boolean // true if this is the last block for a file
	) {
		this.send_bits((STORED_BLOCK << 1) + (eof ? 1 : 0), 3); // send block type
		this.copy_block(buf, stored_len, true); // with header
	}

	// Determine the best encoding for the current block: dynamic trees, static
	// trees or store, and output the encoded block to the zip file.
	private _tr_flush_block(buf: number, // input block, or NULL if too old
		stored_len: number, // length of input block
		eof: boolean // true if this is the last block for a file
	) {
		let opt_lenb, static_lenb;// opt_len and static_len in bytes
		let max_blindex = 0; // index of last bit length code of non zero freq

		// Build the Huffman trees unless a stored block is forced
		if (this.level > 0) {
			// Construct the literal and distance trees
			this.l_desc.build_tree(this);

			this.d_desc.build_tree(this);

			// At this point, opt_len and static_len are the total bit lengths
			// of
			// the compressed block data, excluding the tree representations.

			// Build the bit length tree for the above two trees, and get the
			// index
			// in bl_order of the last bit length code to send.
			max_blindex = this.build_bl_tree();

			// Determine the best encoding. Compute first the block length in
			// bytes
			opt_lenb = (this.opt_len + 3 + 7) >>> 3;
			static_lenb = (this.static_len + 3 + 7) >>> 3;

			if (static_lenb <= opt_lenb)
				opt_lenb = static_lenb;
		} else {
			opt_lenb = static_lenb = stored_len + 5; // force a stored block
		}

		if ((stored_len + 4 <= opt_lenb) && buf !== -1) {
			// 4: two words for the lengths
			// The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
			// Otherwise we can't have processed more than WSIZE input bytes
			// since
			// the last block flush, because compression would have been
			// successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
			// transform a block into a stored block.
			this._tr_stored_block(buf, stored_len, eof);
		} else if (static_lenb == opt_lenb) {
			this.send_bits((STATIC_TREES << 1) + (eof ? 1 : 0), 3);
			this.compress_block(StaticTree.static_ltree, StaticTree.static_dtree);
		} else {
			this.send_bits((DYN_TREES << 1) + (eof ? 1 : 0), 3);
			this.send_all_trees(this.l_desc.max_code + 1, this.d_desc.max_code + 1, max_blindex + 1);
			this.compress_block(this.dyn_ltree, this.dyn_dtree);
		}

		// The above check is made mod 2^32, for files larger than 512 MB
		// and uLong implemented on 32 bits.

		this.init_block();

		if (eof) {
			this.bi_windup();
		}
	}

	private flush_block_only(eof: boolean) {
		this._tr_flush_block(this.block_start >= 0 ? this.block_start : -1, this.strstart - this.block_start, eof);
		this.block_start = this.strstart;
		this.strm.flush_pending(this);
	}

	// Fill the window when the lookahead becomes insufficient.
	// Updates strstart and lookahead.
	//
	// IN assertion: lookahead < MIN_LOOKAHEAD
	// OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
	// At least one byte has been read, or avail_in === 0; reads are
	// performed for at least two bytes (required for the zip translate_eol
	// option -- not supported here).
	private fill_window() {
		// var more; // Amount of free space at the end of the window.

		do {
			let more = (window_size - this.lookahead - this.strstart);

			// Deal with !@#$% 64K limit:
			if (more === 0 && this.strstart === 0 && this.lookahead === 0) {
				more = DC.w_size;
			} else if (more === -1) {
				// Very unlikely, but possible on 16 bit machine if strstart == 0
				// and lookahead == 1 (input done one byte at time)
				more--;

				// If the window is almost full and there is insufficient
				// lookahead,
				// move the upper half to the lower one to make room in the
				// upper half.
			} else if (this.strstart >= DC.w_size + DC.w_size - MIN_LOOKAHEAD) {
				this.window.set(this.window.subarray(DC.w_size, DC.w_size + DC.w_size), 0);

				this.match_start -= DC.w_size;
				this.strstart -= DC.w_size; // we now have strstart >= MAX_DIST
				this.block_start -= DC.w_size;

				// Slide the hash table (could be avoided with 32 bit values
				// at the expense of memory usage). We slide even when level == 0
				// to keep the hash table consistent if we switch back to level > 0
				// later. (Using level 0 permanently is not an optimal usage of
				// zlib, so we don't care about this pathological case.)

				let n = hash_size;
				let p = n;
				do {
					let m = (this.head[--p] & 0xffff);
					this.head[p] = (m >= DC.w_size ? m - DC.w_size : 0);
				} while (--n !== 0);

				n = DC.w_size;
				p = n;
				do {
					let m = (this.prev[--p] & 0xffff);
					this.prev[p] = (m >= DC.w_size ? m - DC.w_size : 0);
					// If n is not on any hash chain, prev[n] is garbage but
					// its value will never be used.
				} while (--n !== 0);
				more += DC.w_size;
			}

			if (this.strm.avail_in === 0)
				return;

			// If there was no sliding:
			// strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
			// more == window_size - lookahead - strstart
			// => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
			// => more >= window_size - 2*WSIZE + 2
			// In the BIG_MEM or MMAP case (not yet supported),
			// window_size == input_size + MIN_LOOKAHEAD &&
			// strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
			// Otherwise, window_size == 2*WSIZE so more >= 2.
			// If there was sliding, more >= WSIZE. So in all cases, more >= 2.

			const n = this.strm.read_into_buf(this.window, this.strstart + this.lookahead, more);
			this.lookahead += n;

			// Initialize the hash value now this we have some input:
			if (this.lookahead >= MIN_MATCH) {
				this.ins_h = this.window[this.strstart] & 0xff;
				this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[this.strstart + 1] & 0xff)) & hash_mask;
			}
			// If the whole input has less than MIN_MATCH bytes, ins_h is
			// garbage,
			// but this is not important since only literal bytes will be
			// emitted.
		} while (this.lookahead < MIN_LOOKAHEAD && this.strm.avail_in !== 0);
	}

	// Copy without compression as much as possible from the input stream,
	// return
	// the current block state.
	// This function does not insert new strings in the dictionary since
	// uncompressible data is probably not useful. This function is used
	// only for the level=0 compression option.
	// NOTE: this function should be optimized to avoid extra copying from
	// window to pending_buf.
	private deflate_stored(flush: ZFlush): BState {
		// Stored blocks are limited to 0xffff bytes, pending_buf is limited
		// to pending_buf_size, and each stored block has a 5 byte header:
		let max_block_size = 0xffff;
		if (max_block_size > pending_buf_size - 5) {
			max_block_size = pending_buf_size - 5;
		}

		// Copy as much as possible from input to output:
		while (true) {
			// Fill the window as much as possible:
			if (this.lookahead <= 1) {
				this.fill_window();
				if (this.lookahead === 0 && flush === ZFlush.NO_FLUSH)
					return BState.NeedMore;
				if (this.lookahead === 0)
					break; // flush the current block
			}

			this.strstart += this.lookahead;
			this.lookahead = 0;

			// Emit a stored block if pending_buf will be full:
			let max_start = this.block_start + max_block_size;
			if (this.strstart === 0 || this.strstart >= max_start) {
				// strstart === 0 is possible when wraparound on 16-bit machine
				this.lookahead = (this.strstart - max_start);
				this.strstart = max_start;

				this.flush_block_only(false);
				if (this.strm.avail_out === 0)
					return BState.NeedMore;

			}

			// Flush if we may have to slide, otherwise block_start may become
			// negative and the data will be gone:
			if (this.strstart - this.block_start >= DC.w_size - MIN_LOOKAHEAD) {
				this.flush_block_only(false);
				if (this.strm.avail_out === 0)
					return BState.NeedMore;
			}
		}

		this.flush_block_only(flush === ZFlush.FINISH);
		if (this.strm.avail_out === 0)
			return (flush === ZFlush.FINISH) ? BState.FinishStarted : BState.NeedMore;

		return flush === ZFlush.FINISH ? BState.FinishDone : BState.BlockDone;
	}

	private longest_match(cur_match: number) {
		let chain_length = this.max_chain_length; // max hash chain length
		let scan = this.strstart; // current string
		// var match; // matched string
		// var len; // length of current match
		let best_len = this.prev_length; // best match length so far
		let limit = this.strstart > (DC.w_size - MIN_LOOKAHEAD) ? this.strstart - (DC.w_size - MIN_LOOKAHEAD) : 0;
		let _nice_match = this.nice_match;
		const win = this.window;

		// Stop when cur_match becomes <= limit. To simplify the code,
		// we prevent matches with the string of window index 0.

		const strend = this.strstart + MAX_MATCH;
		let scan_end1 = win[scan + best_len - 1];
		let scan_end = win[scan + best_len];
		const scan_start = win[scan];
		const scan_start1 = win[scan + 1];

		// The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of
		// 16.
		// It is easy to get rid of this optimization if necessary.

		// Do not waste too much time if we already have a good match:
		if (this.prev_length >= this.good_match) {
			chain_length >>= 2;
		}

		// Do not look for matches beyond the end of the input. This is
		// necessary to make deflate deterministic.
		if (_nice_match > this.lookahead)
			_nice_match = this.lookahead;

		do {
			let match = cur_match;

			let cont = true;
			do {
				match = cur_match;
				if (win[match + best_len] !== scan_end || win[match + best_len - 1] !== scan_end1) {
					if ((cur_match = this.prev[cur_match & DC.w_mask]) > limit && --chain_length !== 0) {
						continue;
					}
					else {
						cont = false;
					}
				}
				break;
			} while (true);

			if (! cont) {
				break;
			}

			if (win[match] !== scan_start || win[match + 1] !== scan_start1)
				continue;
			// if (* (ushf *)match != scan_start)
			//    continue;

/*
			// Skip to next match if the match length cannot increase
			// or if the match length is less than 2:
			if (win[match + best_len] !== scan_end || win[match + best_len - 1] !== scan_end1
				|| win[match] !== win[scan]
				|| win[match + 1] !== win[scan + 1])
				continue;
*/
			// The check at best_len-1 can be removed because it will be made
			// again later. (This heuristic is not always a win.)
			// It is not necessary to compare scan[2] and match[2] since they
			// are always equal when the other bytes match, given this
			// the hash keys are equal and this HASH_BITS >= 8.
			scan += 2;
			match += 2;

			// We check for insufficient lookahead only every 8th comparison;
			// the 256th check will be made at strstart+258.
			do {
				const sv = (win[scan] << 24) | (win[scan + 1] << 16) | (win[scan + 2] << 8) | win[scan + 3];
				const mv = (win[match] << 24) | (win[match + 1] << 16) | (win[match + 2] << 8) | win[match + 3];
				const sxm = sv ^ mv;
				if (sxm) {
					const match_byte = Math.clz32(sxm) >> 3;
					scan += match_byte;
					match += match_byte;
					break;
				}
				else {
					scan += 4;
					match += 4;
				}
			} while (scan < strend);

			if (scan > strend) {
				scan = strend;
			}
/*
			do {
			} while (win[++scan] === win[++match] && win[++scan] === win[++match] && win[++scan] === win[++match]
				&& win[++scan] === win[++match] && win[++scan] === win[++match] && win[++scan] === win[++match]
				&& win[++scan] === win[++match] && win[++scan] === win[++match] && scan < strend);
*/
			let len = MAX_MATCH - (strend - scan);
			scan = strend - MAX_MATCH;

			if (len > best_len) {
				this.match_start = cur_match;
				best_len = len;
				if (len >= _nice_match)
					break;
				scan_end1 = win[scan + best_len - 1];
				scan_end = win[scan + best_len];
			}

		} while ((cur_match = this.prev[cur_match & DC.w_mask]) > limit && --chain_length !== 0);

		if (best_len <= this.lookahead)
			return best_len;
		return this.lookahead;
	}

	// Compress as much as possible from the input stream, return the current
	// block state.
	// This function does not perform lazy evaluation of matches and inserts
	// new strings in the dictionary only for unmatched strings or for short
	// matches. It is used only for the fast compression options.
	private deflate_fast(flush: ZFlush) {
		// short hash_head = 0; // head of the hash chain
		let hash_head = 0; // head of the hash chain
		let bflush; // set if current block must be flushed

		while (true) {
			// Make sure this we always have enough lookahead, except
			// at the end of the input file. We need MAX_MATCH bytes
			// for the next match, plus MIN_MATCH bytes to insert the
			// string following the next match.
			if (this.lookahead < MIN_LOOKAHEAD) {
				this.fill_window();
				if (this.lookahead < MIN_LOOKAHEAD && flush === ZFlush.NO_FLUSH) {
					return BState.NeedMore;
				}
				if (this.lookahead === 0)
					break; // flush the current block
			}

			// Insert the string window[strstart .. strstart+2] in the
			// dictionary, and set hash_head to the head of the hash chain:
			if (this.lookahead >= MIN_MATCH) {
				this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[(this.strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;

				// prev[strstart&DC.w_mask]=hash_head=head[ins_h];
				hash_head = (this.head[this.ins_h] & 0xffff);
				this.prev[this.strstart & DC.w_mask] = this.head[this.ins_h];
				this.head[this.ins_h] = this.strstart;
			}

			// Find the longest match, discarding those <= prev_length.
			// At this point we have always match_length < MIN_MATCH

			if (hash_head !== 0 && ((this.strstart - hash_head) & 0xffff) <= DC.w_size - MIN_LOOKAHEAD) {
				// To simplify the code, we prevent matches with the string
				// of window index 0 (in particular we have to avoid a match
				// of the string with itself at the start of the input file).
				if (this.strategy !== ZStrategy.HUFFMAN_ONLY) {
					this.match_length = this.longest_match(hash_head);
				}
				// longest_match() sets match_start
			}
			if (this.match_length >= MIN_MATCH) {
				// check_match(strstart, match_start, match_length);

				bflush = this._tr_tally(this.strstart - this.match_start, this.match_length - MIN_MATCH);

				this.lookahead -= this.match_length;

				// Insert new strings in the hash table only if the match length
				// is not too large. This saves time but degrades compression.
				if (this.match_length <= this.max_lazy_match && this.lookahead >= MIN_MATCH) {
					this.match_length--; // string at strstart already in hash table
					do {
						this.strstart++;

						this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[(this.strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
						// prev[strstart&DC.w_mask]=hash_head=head[ins_h];
						hash_head = (this.head[this.ins_h] & 0xffff);
						this.prev[this.strstart & DC.w_mask] = this.head[this.ins_h];
						this.head[this.ins_h] = this.strstart;

						// strstart never exceeds WSIZE-MAX_MATCH, so there are
						// always MIN_MATCH bytes ahead.
					} while (--this.match_length !== 0);
					this.strstart++;
				} else {
					this.strstart += this.match_length;
					this.match_length = 0;
					this.ins_h = this.window[this.strstart] & 0xff;

					this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[this.strstart + 1] & 0xff)) & hash_mask;
					// If lookahead < MIN_MATCH, ins_h is garbage, but it does not
					// matter since it will be recomputed at next deflate call.
				}
			} else {
				// No match, output a literal byte
				bflush = this._tr_tally(0, this.window[this.strstart] & 0xff);
				this.lookahead--;
				this.strstart++;
			}
			if (bflush) {
				this.flush_block_only(false);
				if (this.strm.avail_out === 0)
					return BState.NeedMore;
			}
		}

		this.flush_block_only(flush === ZFlush.FINISH);
		if (this.strm.avail_out === 0) {
			if (flush === ZFlush.FINISH)
				return BState.FinishStarted;
			else
				return BState.NeedMore;
		}
		return flush === ZFlush.FINISH ? BState.FinishDone : BState.BlockDone;
	}

	// Same as above, but achieves better compression. We use a lazy
	// evaluation for matches: a match is finally adopted only if there is
	// no better match at the next window position.
	private deflate_slow(flush: ZFlush) {
		let hash_head = 0; // head of hash chain
		let bflush; // set if current block must be flushed
		let max_insert;
		let prev_match;

		// Process the input block.
		while (true) {
			// Make sure this we always have enough lookahead, except
			// at the end of the input file. We need MAX_MATCH bytes
			// for the next match, plus MIN_MATCH bytes to insert the
			// string following the next match.

			if (this.lookahead < MIN_LOOKAHEAD) {
				this.fill_window();
				if (this.lookahead < MIN_LOOKAHEAD && flush === ZFlush.NO_FLUSH) {
					return BState.NeedMore;
				}
				if (this.lookahead === 0)
					break; // flush the current block
			}

			// Insert the string window[strstart .. strstart+2] in the
			// dictionary, and set hash_head to the head of the hash chain:

			if (this.lookahead >= MIN_MATCH) {
				this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[this.strstart + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
				// prev[strstart&DC.w_mask]=hash_head=head[ins_h];
				hash_head = (this.head[this.ins_h] & 0xffff);
				this.prev[this.strstart & DC.w_mask] = this.head[this.ins_h];
				this.head[this.ins_h] = this.strstart;
			}

			// Find the longest match, discarding those <= prev_length.
			this.prev_length = this.match_length;
			prev_match = this.match_start;
			this.match_length = MIN_MATCH - 1;

			if (hash_head !== 0 && this.prev_length < this.max_lazy_match && ((this.strstart - hash_head) & 0xffff) <= DC.w_size - MIN_LOOKAHEAD) {
				// To simplify the code, we prevent matches with the string
				// of window index 0 (in particular we have to avoid a match
				// of the string with itself at the start of the input file).

				if (this.strategy !== ZStrategy.HUFFMAN_ONLY) {
					this.match_length = this.longest_match(hash_head);
				}
				// longest_match() sets match_start

				if (this.match_length <= 5 && (this.strategy === ZStrategy.FILTERED || (this.match_length === MIN_MATCH && this.strstart - this.match_start > 4096))) {
					// If prev_match is also MIN_MATCH, match_start is garbage
					// but we will ignore the current match anyway.
					this.match_length = MIN_MATCH - 1;
				}
			}

			// If there was a match at the previous step and the current
			// match is not better, output the previous match:
			if (this.prev_length >= MIN_MATCH && this.match_length <= this.prev_length) {
				max_insert = this.strstart + this.lookahead - MIN_MATCH;
				// Do not insert strings in hash table beyond this.

				// check_match(strstart-1, prev_match, prev_length);

				bflush = this._tr_tally(this.strstart - 1 - prev_match, this.prev_length - MIN_MATCH);

				// Insert in hash table all strings up to the end of the match.
				// strstart-1 and strstart are already inserted. If there is not
				// enough lookahead, the last two strings are not inserted in
				// the hash table.
				this.lookahead -= this.prev_length - 1;
				this.prev_length -= 2;
				do {
					if (++this.strstart <= max_insert) {
						this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[(this.strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
						// prev[strstart&DC.w_mask]=hash_head=head[ins_h];
						hash_head = (this.head[this.ins_h] & 0xffff);
						this.prev[this.strstart & DC.w_mask] = this.head[this.ins_h];
						this.head[this.ins_h] = this.strstart;
					}
				} while (--this.prev_length !== 0);
				this.match_available = false;
				this.match_length = MIN_MATCH - 1;
				this.strstart++;

				if (bflush) {
					this.flush_block_only(false);
					if (this.strm.avail_out === 0)
						return BState.NeedMore;
				}
			} else if (this.match_available) {

				// If there was no match at the previous position, output a
				// single literal. If there was a match but the current match
				// is longer, truncate the previous match to a single literal.

				bflush = this._tr_tally(0, this.window[this.strstart - 1] & 0xff);

				if (bflush) {
					this.flush_block_only(false);
				}
				this.strstart++;
				this.lookahead--;
				if (this.strm.avail_out === 0)
					return BState.NeedMore;
			} else {
				// There is no previous match to compare with, wait for
				// the next step to decide.

				this.match_available = true;
				this.strstart++;
				this.lookahead--;
			}
		}

		if (this.match_available) {
			bflush = this._tr_tally(0, this.window[this.strstart - 1] & 0xff);
			this.match_available = false;
		}
		this.flush_block_only(flush === ZFlush.FINISH);

		if (this.strm.avail_out === 0) {
			if (flush === ZFlush.FINISH)
				return BState.FinishStarted;
			else
				return BState.NeedMore;
		}

		return flush === ZFlush.FINISH ? BState.FinishDone : BState.BlockDone;
	}

	deflateSetDictionary(dictionary: Uint8Array) {
		const dictLength = dictionary.byteLength;
		let length = dictLength;
		let n, index = 0;

		if (!dictionary || this.status !== DeflateState.INIT)
			return ZStatus.STREAM_ERROR;

		if (length < MIN_MATCH)
			return ZStatus.OK;
		if (length > DC.w_size - MIN_LOOKAHEAD) {
			length = DC.w_size - MIN_LOOKAHEAD;
			index = dictLength - length; // use the tail of the dictionary
		}
		this.window.set(dictionary.subarray(index, index + length), 0);

		this.strstart = length;
		this.block_start = length;

		// Insert all strings in the hash table (except for the last two bytes).
		// s->lookahead stays null, so s->ins_h will be recomputed at the next
		// call of fill_window.

		this.ins_h = this.window[0] & 0xff;
		this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[1] & 0xff)) & hash_mask;

		for (n = 0; n <= length - MIN_MATCH; n++) {
			this.ins_h = ((this.ins_h << hash_shift) ^ (this.window[n + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
			this.prev[n & DC.w_mask] = this.head[this.ins_h];
			this.head[this.ins_h] = n;
		}
		return ZStatus.OK;
	}

	deflate(flush: ZFlush) {
		if (flush > ZFlush.FINISH || flush < 0) {
			return ZStatus.STREAM_ERROR;
		}
		const { strm } = this;

		if (!strm.next_out || (!strm.next_in && strm.avail_in !== 0) || (this.status === DeflateState.FINISH && flush != ZFlush.FINISH)) {
			// _strm.msg = z_errmsg[Z_NEED_DICT - (Z_STREAM_ERROR)];
			return ZStatus.STREAM_ERROR;
		}
		if (strm.avail_out === 0) {
			// _strm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];
			return ZStatus.BUF_ERROR;
		}

		let old_flush = this.last_flush;
		this.last_flush = flush;

		// this status transition is only marked to prevent setting the
		// preset dictionary after compression has started
		if (this.status === DeflateState.INIT) {
			this.status = DeflateState.BUSY;
		}

		// Flush as much pending output as possible
		if (this.pending !== 0) {
			strm.flush_pending(this);
			if (strm.avail_out === 0) {
				// console.log(" avail_out==0");
				// Since avail_out is 0, deflate will be called again with
				// more output space, but possibly with both pending and
				// avail_in equal to zero. There won't be anything to do,
				// but this is not an error situation so make sure we
				// return OK instead of BUF_ERROR at next call of deflate:
				this.last_flush = -1;
				return ZStatus.OK;
			}

			// Make sure there is something to do and avoid duplicate
			// consecutive
			// flushes. For repeated and useless calls with Z_FINISH, we keep
			// returning Z_STREAM_END instead of Z_BUFF_ERROR.
		} else if (strm.avail_in === 0 && flush <= old_flush && flush !== ZFlush.FINISH) {
			// strm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];
			return ZStatus.BUF_ERROR;
		}

		// User must not provide more input after the first FINISH:
		if (this.status === DeflateState.FINISH && strm.avail_in !== 0) {
			// _strm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];
			return ZStatus.BUF_ERROR;
		}

		// Start a new block or continue the current one.
		if (strm.avail_in !== 0 || this.lookahead !== 0 || (flush !== ZFlush.NO_FLUSH && this.status !== DeflateState.FINISH)) {
			let bstate: BState;
			switch (config_table[this.level].func) {
				case ZFunc.STORED:
					bstate = this.deflate_stored(flush);
					break;
				case ZFunc.FAST:
					bstate = this.deflate_fast(flush);
					break;
				case ZFunc.SLOW:
				default:
					bstate = this.deflate_slow(flush);
					break;
			}

			if (bstate == BState.FinishStarted || bstate === BState.FinishDone) {
				this.status = DeflateState.FINISH;
			}
			if (bstate === BState.NeedMore || bstate === BState.FinishStarted) {
				if (strm.avail_out === 0) {
					this.last_flush = -1; // avoid BUF_ERROR next call, see above
				}
				return ZStatus.OK;
				// If flush != Z_NO_FLUSH && avail_out === 0, the next call
				// of deflate should use the same flush parameter to make sure
				// this the flush is complete. So we don't have to output an
				// empty block here, this will be done at next call. This also
				// ensures this for a very small output buffer, we emit at most
				// one empty block.
			}

			if (bstate === BState.BlockDone) {
				if (flush === ZFlush.PARTIAL_FLUSH) {
					this._tr_align();
				} else { // FULL_FLUSH or SYNC_FLUSH
					this._tr_stored_block(0, 0, false);
					// For a full flush, this empty block will be recognized
					// as a special marker by inflate_sync().
					if (flush === ZFlush.FULL_FLUSH) {
						for (let i = 0; i < hash_size; i++)
							// forget history
							this.head[i] = 0;
					}
				}
				strm.flush_pending(this);
				if (strm.avail_out === 0) {
					this.last_flush = -1; // avoid BUF_ERROR at next call, see above
					return ZStatus.OK;
				}
			}
		}

		if (flush !== ZFlush.FINISH)
			return ZStatus.OK;
		return ZStatus.STREAM_END;
	}
}
