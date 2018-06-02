// InfCodes
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name

import { inflate_mask, NumArray, ZBuffer, ZStatus, ZStreamData } from "./common";

// waiting for "i:"=input,
// "o:"=output,
// "x:"=nothing
const enum Mode {
	START = 0,   // x: set up for Mode.LEN
	LEN = 1,     // i: get length/literal/eob next
	LENEXT = 2,  // i: getting length extra (have base)
	DIST = 3,    // i: get distance next
	DISTEXT = 4, // i: getting distance extra
	COPY = 5,    // o: copying bytes in window, waiting for space
	LIT = 6,     // o: got literal, waiting for output space
	WASH = 7,    // o: got eob, possibly still output waiting
	END = 8,     // x: got eob and all data flushed
	BADCODE = 9, // x: got error
}

export function InfCodes() {
	let mode: Mode; // current inflate_codes mode

	// mode dependent information
	let len = 0;

	let tree: NumArray; // pointer into tree
	let tree_index = 0;
	let need = 0; // bits needed

	let lit = 0;

	// if EXT or Mode.COPY, where and how much
	let get = 0; // bits to get for extra
	let dist = 0; // distance back to copy from

	let lbits = 0; // ltree bits decoded per branch
	let dbits = 0; // dtree bits decoder per branch
	let ltree: NumArray; // literal/length/eob tree
	let ltree_index = 0; // literal/length/eob tree
	let dtree: NumArray; // distance tree
	let dtree_index = 0; // distance tree

	// Called with number of bytes left to write in window at least 258
	// (the maximum string length) and number of input bytes available
	// at least ten. The ten bytes are six bytes for the longest length/
	// distance pair plus four bytes for overloading the bit buffer.

	function inflate_fast(bl: number, bd: number, tl: NumArray, tl_index: number, td: NumArray, td_index: number, s: ZBuffer, z: ZStreamData) {
		let t; // temporary pointer
		let tp; // temporary pointer
		let tp_index; // temporary pointer
		let e; // extra bits or operation
		let b; // bit buffer
		let k; // bits in bit buffer
		let p; // input data pointer
		let n; // bytes available there
		let q; // output window write pointer
		let m; // bytes to end of window or read pointer
		let ml; // mask for literal/length tree
		let md; // mask for distance tree
		let c; // bytes to copy
		let d; // distance back to copy from
		let r; // copy source pointer

		let tp_index_t_3; // (tp_index+t)*3

		// load input, output, bit values
		p = z.next_in_index;
		n = z.avail_in;
		b = s.bitb;
		k = s.bitk;
		q = s.write;
		m = q < s.read ? s.read - q - 1 : s.end - q;

		// initialize masks
		ml = inflate_mask[bl];
		md = inflate_mask[bd];

		// do until not enough input or output space for fast loop
		do { // assume called with m >= 258 && n >= 10
			// get literal/length code
			while (k < (20)) { // max bits for literal/length code
				n--;
				b |= (z.next_in[p++] & 0xff) << k;
				k += 8;
			}

			t = b & ml;
			tp = tl;
			tp_index = tl_index;
			tp_index_t_3 = (tp_index + t) * 3;
			e = tp[tp_index_t_3];
			if (e === 0) {
				b >>= (tp[tp_index_t_3 + 1]);
				k -= (tp[tp_index_t_3 + 1]);

				s.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];
				m--;
				continue;
			}
			do {

				b >>= (tp[tp_index_t_3 + 1]);
				k -= (tp[tp_index_t_3 + 1]);

				if ((e & 16) !== 0) {
					e &= 15;
					c = tp[tp_index_t_3 + 2] + (/* (int) */b & inflate_mask[e]);

					b >>= e;
					k -= e;

					// decode distance base of block to copy
					while (k < (15)) { // max bits for distance code
						n--;
						b |= (z.next_in[p++] & 0xff) << k;
						k += 8;
					}

					t = b & md;
					tp = td;
					tp_index = td_index;
					tp_index_t_3 = (tp_index + t) * 3;
					e = tp[tp_index_t_3];

					do {

						b >>= (tp[tp_index_t_3 + 1]);
						k -= (tp[tp_index_t_3 + 1]);

						if ((e & 16) !== 0) {
							// get extra bits to add to distance base
							e &= 15;
							while (k < (e)) { // get extra bits (up to 13)
								n--;
								b |= (z.next_in[p++] & 0xff) << k;
								k += 8;
							}

							d = tp[tp_index_t_3 + 2] + (b & inflate_mask[e]);

							b >>= (e);
							k -= (e);

							// do the copy
							m -= c;
							if (q >= d) { // offset before dest
								// just copy
								r = q - d;
								// if (q - r > 0 && 2 > (q - r)) {
								s.window[q++] = s.window[r++]; // minimum count is three,
								s.window[q++] = s.window[r++]; // so unroll loop a little
								c -= 2;
								// } else {
								// 	s.window.set(s.window.subarray(r, r + 2), q);
								// 	q += 2;
								// 	r += 2;
								// 	c -= 2;
								// }
							} else { // else offset after destination
								r = q - d;
								do {
									r += s.end; // force pointer in window
								} while (r < 0); // covers invalid distances
								e = s.end - r;
								if (c > e) { // if source crosses,
									c -= e; // wrapped copy
									// if (q - r > 0 && e > (q - r)) {
									do {
										s.window[q++] = s.window[r++];
									} while (--e !== 0);
									// } else {
									// 	s.window.set(s.window.subarray(r, r + e), q);
									// 	q += e;
									// 	r += e;
									// 	e = 0;
									// }
									r = 0; // copy rest from start of window
								}

							}

							// copy all or what's left
							// if (q - r > 0 && c > (q - r)) {
							do {
								s.window[q++] = s.window[r++];
							} while (--c !== 0);
							// } else {
							// 	s.window.set(s.window.subarray(r, r + c), q);
							// 	q += c;
							// 	r += c;
							// 	c = 0;
							// }
							break;
						} else if ((e & 64) === 0) {
							t += tp[tp_index_t_3 + 2];
							t += (b & inflate_mask[e]);
							tp_index_t_3 = (tp_index + t) * 3;
							e = tp[tp_index_t_3];
						} else {
							z.msg = "invalid distance code";

							c = z.avail_in - n;
							c = (k >> 3) < c ? k >> 3 : c;
							n += c;
							p -= c;
							k -= c << 3;

							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;

							return ZStatus.DATA_ERROR;
						}
					} while (true);
					break;
				}

				if ((e & 64) === 0) {
					t += tp[tp_index_t_3 + 2];
					t += (b & inflate_mask[e]);
					tp_index_t_3 = (tp_index + t) * 3;
					e = tp[tp_index_t_3];
					if (e === 0) {
						b >>= (tp[tp_index_t_3 + 1]);
						k -= (tp[tp_index_t_3 + 1]);

						s.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];
						m--;
						break;
					}
				} else if ((e & 32) !== 0) {

					c = z.avail_in - n;
					c = (k >> 3) < c ? k >> 3 : c;
					n += c;
					p -= c;
					k -= c << 3;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;

					return ZStatus.STREAM_END;
				} else {
					z.msg = "invalid literal/length code";

					c = z.avail_in - n;
					c = (k >> 3) < c ? k >> 3 : c;
					n += c;
					p -= c;
					k -= c << 3;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;

					return ZStatus.DATA_ERROR;
				}
			} while (true);
		} while (m >= 258 && n >= 10);

		// not enough input or output--restore pointers and return
		c = z.avail_in - n;
		c = (k >> 3) < c ? k >> 3 : c;
		n += c;
		p -= c;
		k -= c << 3;

		s.bitb = b;
		s.bitk = k;
		z.avail_in = n;
		z.total_in += p - z.next_in_index;
		z.next_in_index = p;
		s.write = q;

		return ZStatus.OK;
	}

	function init(bl: number, bd: number, tl: NumArray, tl_index: number, td: NumArray, td_index: number) {
		mode = Mode.START;
		lbits = /* (byte) */bl;
		dbits = /* (byte) */bd;
		ltree = tl;
		ltree_index = tl_index;
		dtree = td;
		dtree_index = td_index;
		// tree = null;
	}

	function proc(s: ZBuffer, z: ZStreamData, r: ZStatus) {
		let j; // temporary storage
		let tindex; // temporary pointer
		let e; // extra bits or operation
		let b = 0; // bit buffer
		let k = 0; // bits in bit buffer
		let p = 0; // input data pointer
		let n; // bytes available there
		let q; // output window write pointer
		let m; // bytes to end of window or read pointer
		let f; // pointer to copy strings from

		// copy input/output information to locals (UPDATE macro restores)
		p = z.next_in_index;
		n = z.avail_in;
		b = s.bitb;
		k = s.bitk;
		q = s.write;
		m = q < s.read ? s.read - q - 1 : s.end - q;

		// process input and output based on current state
		while (true) {
			switch (mode) {
			// waiting for "i:"=input, "o:"=output, "x:"=nothing
			case Mode.START: // x: set up for Mode.LEN
				if (m >= 258 && n >= 10) {

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					r = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s, z);

					p = z.next_in_index;
					n = z.avail_in;
					b = s.bitb;
					k = s.bitk;
					q = s.write;
					m = q < s.read ? s.read - q - 1 : s.end - q;

					if (r !== ZStatus.OK) {
						mode = r === ZStatus.STREAM_END ? Mode.WASH : Mode.BADCODE;
						break;
					}
				}
				need = lbits;
				tree = ltree;
				tree_index = ltree_index;

				mode = Mode.LEN;
				/* falls through */
			case Mode.LEN: // i: get length/literal/eob next
				j = need;

				while (k < (j)) {
					if (n !== 0) {
						r = ZStatus.OK;
					}
					else {

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						return s.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				tindex = (tree_index + (b & inflate_mask[j])) * 3;

				b >>>= (tree[tindex + 1]);
				k -= (tree[tindex + 1]);

				e = tree[tindex];

				if (e === 0) { // literal
					lit = tree[tindex + 2];
					mode = Mode.LIT;
					break;
				}
				if ((e & 16) !== 0) { // length
					get = e & 15;
					len = tree[tindex + 2];
					mode = Mode.LENEXT;
					break;
				}
				if ((e & 64) === 0) { // next table
					need = e;
					tree_index = tindex / 3 + tree[tindex + 2];
					break;
				}
				if ((e & 32) !== 0) { // end of block
					mode = Mode.WASH;
					break;
				}
				mode = Mode.BADCODE; // invalid code
				z.msg = "invalid literal/length code";
				r = ZStatus.DATA_ERROR;

				s.bitb = b;
				s.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				s.write = q;
				return s.inflate_flush(z, r);

			case Mode.LENEXT: // i: getting length extra (have base)
				j = get;

				while (k < (j)) {
					if (n !== 0) {
						r = ZStatus.OK;
					}
					else {

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						return s.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				len += (b & inflate_mask[j]);

				b >>= j;
				k -= j;

				need = dbits;
				tree = dtree;
				tree_index = dtree_index;
				mode = Mode.DIST;
				/* falls through */
			case Mode.DIST: // i: get distance next
				j = need;

				while (k < (j)) {
					if (n !== 0) {
						r = ZStatus.OK;
					}
					else {

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						return s.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				tindex = (tree_index + (b & inflate_mask[j])) * 3;

				b >>= tree[tindex + 1];
				k -= tree[tindex + 1];

				e = (tree[tindex]);
				if ((e & 16) !== 0) { // distance
					get = e & 15;
					dist = tree[tindex + 2];
					mode = Mode.DISTEXT;
					break;
				}
				if ((e & 64) === 0) { // next table
					need = e;
					tree_index = tindex / 3 + tree[tindex + 2];
					break;
				}
				mode = Mode.BADCODE; // invalid code
				z.msg = "invalid distance code";
				r = ZStatus.DATA_ERROR;

				s.bitb = b;
				s.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				s.write = q;
				return s.inflate_flush(z, r);

			case Mode.DISTEXT: // i: getting distance extra
				j = get;

				while (k < (j)) {
					if (n !== 0) {
						r = ZStatus.OK;
					}
					else {

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						return s.inflate_flush(z, r);
					}
					n--;
					b |= (z.next_in[p++] & 0xff) << k;
					k += 8;
				}

				dist += (b & inflate_mask[j]);

				b >>= j;
				k -= j;

				mode = Mode.COPY;
				/* falls through */
			case Mode.COPY: // o: copying bytes in window, waiting for space
				f = q - dist;
				while (f < 0) { // modulo window size-"while" instead
					f += s.end; // of "if" handles invalid distances
				}
				while (len !== 0) {

					if (m === 0) {
						if (q === s.end && s.read !== 0) {
							q = 0;
							m = q < s.read ? s.read - q - 1 : s.end - q;
						}
						if (m === 0) {
							s.write = q;
							r = s.inflate_flush(z, r);
							q = s.write;
							m = q < s.read ? s.read - q - 1 : s.end - q;

							if (q === s.end && s.read !== 0) {
								q = 0;
								m = q < s.read ? s.read - q - 1 : s.end - q;
							}

							if (m === 0) {
								s.bitb = b;
								s.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								s.write = q;
								return s.inflate_flush(z, r);
							}
						}
					}

					s.window[q++] = s.window[f++];
					m--;

					if (f === s.end) {
						f = 0;
					}
					len--;
				}
				mode = Mode.START;
				break;
			case Mode.LIT: // o: got literal, waiting for output space
				if (m === 0) {
					if (q === s.end && s.read !== 0) {
						q = 0;
						m = q < s.read ? s.read - q - 1 : s.end - q;
					}
					if (m === 0) {
						s.write = q;
						r = s.inflate_flush(z, r);
						q = s.write;
						m = q < s.read ? s.read - q - 1 : s.end - q;

						if (q === s.end && s.read !== 0) {
							q = 0;
							m = q < s.read ? s.read - q - 1 : s.end - q;
						}
						if (m === 0) {
							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;
							return s.inflate_flush(z, r);
						}
					}
				}
				r = ZStatus.OK;

				s.window[q++] = /* (byte) */lit;
				m--;

				mode = Mode.START;
				break;
			case Mode.WASH: // o: got eob, possibly more output
				if (k > 7) { // return unused byte, if any
					k -= 8;
					n++;
					p--; // can always return one
				}

				s.write = q;
				r = s.inflate_flush(z, r);
				q = s.write;
				m = q < s.read ? s.read - q - 1 : s.end - q;

				if (s.read !== s.write) {
					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);
				}
				mode = Mode.END;
				/* falls through */
			case Mode.END:
				r = ZStatus.STREAM_END;
				s.bitb = b;
				s.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				s.write = q;
				return s.inflate_flush(z, r);

			case Mode.BADCODE: // x: got error

				r = ZStatus.DATA_ERROR;

				s.bitb = b;
				s.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				s.write = q;
				return s.inflate_flush(z, r);

			default:
				r = ZStatus.STREAM_ERROR;

				s.bitb = b;
				s.bitk = k;
				z.avail_in = n;
				z.total_in += p - z.next_in_index;
				z.next_in_index = p;
				s.write = q;
				return s.inflate_flush(z, r);
			}
		}
	}

	return {
		init, proc
	};
}
