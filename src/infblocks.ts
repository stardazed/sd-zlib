/**
 * gzip/infblocks - block inflate method
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

import { ZStatus, ZLimits, ZBuffer, inflate_mask, InOut, NumArray } from "./common";
import { InfCodes } from "./infcodes";
import { inflate_trees_dynamic, inflate_trees_bits, inflate_trees_fixed } from "./inftree";
import { ZStream } from "./zstream";

// Table for deflate from PKZIP's appnote.txt.
const border = [ // Order of the bit length code lengths
	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
];

const enum Mode {
	TYPE = 0,   // get type bits (3, including end bit)
	LENS = 1,   // get lengths for stored
	STORED = 2, // processing stored block
	TABLE = 3,  // get table lengths
	BTREE = 4,  // get bit lengths tree for a dynamic block
	DTREE = 5,  // get length, distance trees for a dynamic block
	CODES = 6,  // processing fixed or dynamic block
	DRY = 7,    // output remaining window bytes
	DONELOCKS = 8, // finished last block, done
	BADBLOCKS = 9, // ot a data error--stuck here
}

export class InfBlocks implements ZBuffer {
	constructor(windowSize: number) {
		this.end = windowSize;
		this.window = new Uint8Array(windowSize);
	}

	readonly window: Uint8Array; // sliding window
	readonly end: number; // one byte after sliding window
	readonly codes = InfCodes();
	readonly hufts = new Int32Array(ZLimits.MANY * 3); // single malloc for tree space

	mode: Mode = Mode.TYPE;
	bitk = 0; // bits in bit buffer
	bitb = 0; // bit buffer
	read = 0; // window read pointer
	write = 0; // window write pointer
	last = 0; // was this the last block?

	reset() {
		this.bitk = 0;
		this.bitb = 0;
		this.read = 0;
		this.write = 0;
		this.last = 0;
	}

	// copy as much as possible from the sliding window to the output area
	inflate_flush(z: ZStream, r: ZStatus) {
		let n;
		let p;
		let q;

		// local copies of source and destination pointers
		p = z.next_out_index;
		q = this.read;

		// compute number of bytes to copy as far as end of window
		n = /* (int) */((q <= this.write ? this.write : this.end) - q);
		if (n > z.avail_out) {
			n = z.avail_out;
		}
		if (n !== 0 && r === ZStatus.BUF_ERROR) {
			r = ZStatus.OK;
		}

		// update counters
		z.avail_out -= n;
		z.total_out += n;

		// copy as far as end of window
		z.next_out.set(this.window.subarray(q, q + n), p);
		p += n;
		q += n;

		// see if more to copy at beginning of window
		if (q === this.end) {
			// wrap pointers
			q = 0;
			if (this.write === this.end) {
				this.write = 0;
			}

			// compute bytes to copy
			n = this.write - q;
			if (n > z.avail_out) {
				n = z.avail_out;
			}
			if (n !== 0 && r === ZStatus.BUF_ERROR) {
				r = ZStatus.OK;
			}

			// update counters
			z.avail_out -= n;
			z.total_out += n;

			// copy
			z.next_out.set(this.window.subarray(q, q + n), p);
			p += n;
			q += n;
		}

		// update pointers
		z.next_out_index = p;
		this.read = q;

		// done
		return r;
	}

	proc(z: ZStream, r: ZStatus) {
		let t: number; // temporary storage
		let b: number; // bit buffer
		let k: number; // bits in bit buffer
		let p: number; // input data pointer
		let n: number; // bytes available there
		let q: number; // output window write pointer
		let m: number; // bytes to end of window or read pointer

		let i: number;

		let left = 0; // if Mode.STORED, bytes left to copy

		let table = 0; // table lengths (14 bits)
		let index = 0; // index into blens (or border)
		let blens: number[] = []; // bit lengths of codes
		const bb: InOut<number> = [0]; // bit length tree depth
		const tb: InOut<number> = [0]; // bit length decoding tree

		const codes = this.codes; // if Mode.CODES, current state
		const hufts = this.hufts;

		// copy input/output information to locals (UPDATE macro restores)
		// {
		p = z.next_in_index;
		n = z.avail_in;
		b = this.bitb;
		k = this.bitk;
		// }
		// {
		q = this.write;
		m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);
		// }

		// process input based on current state
		while (true) {
			switch (this.mode) {
			case Mode.TYPE:
				if (this.last) {
					return ZStatus.STREAM_END;
				}
				while (k < (3)) {
					if (n !== 0) {
						r = ZStatus.OK;
					} else {
						this.bitb = b;
						this.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						this.write = q;
						return this.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}
				t = /* (int) */(b & 7);
				this.last = t & 1;

				switch (t >>> 1) {
				case 0: // stored
					// {
					b >>>= (3);
					k -= (3);
					// }
					t = k & 7; // go to byte boundary

					// {
					b >>>= (t);
					k -= (t);
					// }
					this.mode = Mode.LENS; // get length of stored block
					break;
				case 1: // fixed
					// {
					const bl: InOut<number> = [0];
					const bd: InOut<number> = [0];
					const tl: InOut<NumArray> = [[]];
					const td: InOut<NumArray> = [[]];

					inflate_trees_fixed(bl, bd, tl, td);
					codes.init(bl[0], bd[0], tl[0], 0, td[0], 0);
					// }

					// {
					b >>>= (3);
					k -= (3);
					// }

					this.mode = Mode.CODES;
					break;
				case 2: // dynamic

					// {
					b >>>= (3);
					k -= (3);
					// }

					this.mode = Mode.TABLE;
					break;
				case 3: // illegal

					// {
					b >>>= (3);
					k -= (3);
					// }
					this.mode = Mode.BADBLOCKS;
					z.msg = "invalid block type";
					r = ZStatus.DATA_ERROR;

					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}
				break;
			case Mode.LENS:
				while (k < (32)) {
					if (n !== 0) {
						r = ZStatus.OK;
					} else {
						this.bitb = b;
						this.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						this.write = q;
						return this.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				if ((((~b) >>> 16) & 0xffff) !== (b & 0xffff)) {
					this.mode = Mode.BADBLOCKS;
					z.msg = "invalid stored block lengths";
					r = ZStatus.DATA_ERROR;

					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}
				left = (b & 0xffff);
				b = k = 0; // dump bits
				this.mode = left !== 0 ? Mode.STORED : (this.last !== 0 ? Mode.DRY : Mode.TYPE);
				break;
			case Mode.STORED:
				if (n === 0) {
					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}

				if (m === 0) {
					if (q === this.end && this.read !== 0) {
						q = 0;
						m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);
					}
					if (m === 0) {
						this.write = q;
						r = this.inflate_flush(z, r);
						q = this.write;
						m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);
						if (q === this.end && this.read !== 0) {
							q = 0;
							m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);
						}
						if (m === 0) {
							this.bitb = b;
							this.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							this.write = q;
							return this.inflate_flush(z, r);
						}
					}
				}
				r = ZStatus.OK;

				t = left;
				if (t > n) {
					t = n;
				}
				if (t > m) {
					t = m;
				}
				this.window.set(z.read_buf(p, t), q);
				p += t;
				n -= t;
				q += t;
				m -= t;
				left -= t;
				if (left !== 0) {
					break;
				}
				this.mode = this.last !== 0 ? Mode.DRY : Mode.TYPE;
				break;
			case Mode.TABLE:

				while (k < (14)) {
					if (n !== 0) {
						r = ZStatus.OK;
					} else {
						this.bitb = b;
						this.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						this.write = q;
						return this.inflate_flush(z, r);
					}

					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				table = t = (b & 0x3fff);
				if ((t & 0x1f) > 29 || ((t >> 5) & 0x1f) > 29) {
					this.mode = Mode.BADBLOCKS;
					z.msg = "too many length or distance symbols";
					r = ZStatus.DATA_ERROR;

					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}
				t = 258 + (t & 0x1f) + ((t >> 5) & 0x1f);
				if (blens.length < t) {
					blens = []; // new Array(t);
				} else {
					for (i = 0; i < t; i++) {
						blens[i] = 0;
					}
				}

				// {
				b >>>= (14);
				k -= (14);
				// }

				index = 0;
				this.mode = Mode.BTREE;
				/* falls through */
			// case Mode.BTREE:
				while (index < 4 + (table >>> 10)) {
					while (k < (3)) {
						if (n !== 0) {
							r = ZStatus.OK;
						} else {
							this.bitb = b;
							this.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							this.write = q;
							return this.inflate_flush(z, r);
						}
						n--;
						b |= (z.next_in[p++] & 0xff) << k;
						k += 8;
					}

					blens[border[index++]] = b & 7;

					// {
					b >>>= (3);
					k -= (3);
					// }
				}

				while (index < 19) {
					blens[border[index++]] = 0;
				}

				bb[0] = 7;
				t = inflate_trees_bits(blens, bb, tb, hufts, z);
				if (t !== ZStatus.OK) {
					r = t;
					if (r === ZStatus.DATA_ERROR) {
						// blens = null;
						this.mode = Mode.BADBLOCKS;
					}

					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}

				index = 0;
				this.mode = Mode.DTREE;
				/* falls through */
			// case Mode.DTREE:
				while (true) {
					t = table;
					if (index >= 258 + (t & 0x1f) + ((t >> 5) & 0x1f)) {
						break;
					}

					let j, c;

					t = bb[0];

					while (k < (t)) {
						if (n !== 0) {
							r = ZStatus.OK;
						} else {
							this.bitb = b;
							this.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							this.write = q;
							return this.inflate_flush(z, r);
						}
						n--;
						b |= (z.next_in[p++] & 0xff) << k;
						k += 8;
					}

					// if (tb[0] == -1) {
					// System.err.println("null...");
					// }

					t = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 1];
					c = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 2];

					if (c < 16) {
						b >>>= (t);
						k -= (t);
						blens[index++] = c;
					} else { // c == 16..18
						i = c === 18 ? 7 : c - 14;
						j = c === 18 ? 11 : 3;

						while (k < (t + i)) {
							if (n !== 0) {
								r = ZStatus.OK;
							} else {
								this.bitb = b;
								this.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								this.write = q;
								return this.inflate_flush(z, r);
							}
							n--;
							b |= (z.next_in[p++] & 0xff) << k;
							k += 8;
						}

						b >>>= (t);
						k -= (t);

						j += (b & inflate_mask[i]);

						b >>>= (i);
						k -= (i);

						i = index;
						t = table;
						if (i + j > 258 + (t & 0x1f) + ((t >> 5) & 0x1f) || (c === 16 && i < 1)) {
							this.mode = Mode.BADBLOCKS;
							z.msg = "invalid bit length repeat";
							r = ZStatus.DATA_ERROR;

							this.bitb = b;
							this.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							this.write = q;
							return this.inflate_flush(z, r);
						}

						c = c === 16 ? blens[i - 1] : 0;
						do {
							blens[i++] = c;
						} while (--j !== 0);
						index = i;
					}
				}

				tb[0] = -1;
				// {
				const bl_: InOut<number> = [9]; // must be <= 9 for lookahead assumptions
				const bd_: InOut<number> = [6]; // must be <= 9 for lookahead assumptions
				const tl_: InOut<number> = [0];
				const td_: InOut<number> = [0];

				t = inflate_trees_dynamic(257 + (t & 0x1f), 1 + ((t >> 5) & 0x1f), blens, bl_, bd_, tl_, td_, hufts, z);

				if (t !== ZStatus.OK) {
					if (t === ZStatus.DATA_ERROR) {
						this.mode = Mode.BADBLOCKS;
					}
					r = t;

					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}
				codes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);
				// }
				this.mode = Mode.CODES;
				/* falls through */
			case Mode.CODES:
				this.bitb = b;
				this.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				this.write = q;

				r = codes.proc(this, z, r);
				if (r !== ZStatus.STREAM_END) {
					return this.inflate_flush(z, r);
				}
				r = ZStatus.OK;

				p = z.next_in_index;
				n = z.avail_in;
				b = this.bitb;
				k = this.bitk;
				q = this.write;
				m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);

				if (this.last === 0) {
					this.mode = Mode.TYPE;
					break;
				}
				this.mode = Mode.DRY;
				/* falls through */
			case Mode.DRY:
				this.write = q;
				r = this.inflate_flush(z, r);
				q = this.write;
				m = /* (int) */(q < this.read ? this.read - q - 1 : this.end - q);
				if (this.read !== this.write) {
					this.bitb = b;
					this.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					this.write = q;
					return this.inflate_flush(z, r);
				}
				this.mode = Mode.DONELOCKS;
				/* falls through */
			case Mode.DONELOCKS:
				r = ZStatus.STREAM_END;

				this.bitb = b;
				this.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				this.write = q;
				return this.inflate_flush(z, r);
			case Mode.BADBLOCKS:
				r = ZStatus.DATA_ERROR;

				this.bitb = b;
				this.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				this.write = q;
				return this.inflate_flush(z, r);

			default:
				r = ZStatus.STREAM_ERROR;

				this.bitb = b;
				this.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				this.write = q;
				return this.inflate_flush(z, r);
			}
		}
	}

	set_dictionary(d: Uint8Array, start: number, n: number) {
		this.window.set(d.subarray(start, start + n), 0);
		this.read = this.write = n;
	}
}
