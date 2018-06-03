// Inflate
// Part of sd-inflate -- see index for copyright and info

import { ZLimits, ZStatus } from "./common";
import { ZStream } from "./zstream";
import { InfBlocks } from "./infblocks";

// preset dictionary flag in zlib header
const PRESET_DICT = 0x20;
const Z_DEFLATED = 8;

const enum Mode {
	METHOD = 0, // waiting for method byte
	FLAG = 1, // waiting for flag byte
	DICT4 = 2, // four dictionary check bytes to go
	DICT3 = 3, // three dictionary check bytes to go
	DICT2 = 4, // two dictionary check bytes to go
	DICT1 = 5, // one dictionary check byte to go
	DICT0 = 6, // waiting for inflateSetDictionary
	BLOCKS = 7, // decompressing blocks
	DONE = 12, // finished check, done
	BAD = 13, // got an error--stay here
}

const mark = [ 0, 0, 0xff, 0xff ];

export class Inflate {
	private mode: Mode; // current inflate mode

	// mode dependent information
	method = 0; // if FLAGS, method byte

	// if CHECK, check values to compare
	was = [0]; // computed check value
	need = 0; // stream check value

	// if BAD, inflateSync's marker bytes count
	marker = 0;

	// mode independent information
	wbits = 0; // log2(window size) (8..15, defaults to 15)

	blocks: InfBlocks; // current inflate_blocks state

	constructor(private z: ZStreamData, w: number) {
		// set window size
		if (w < ZLimits.MIN_BITS || w > ZLimits.MAX_BITS) {
			throw new Error("Invalid window size");
		}
		this.wbits = w;
		this.blocks = new InfBlocks(1 << w);

		this.reset();
	}

	reset() {
		const { z } = this;

		z.total_in = z.total_out = 0;
		z.msg = null;
		this.mode = BLOCKS;
		this.blocks.reset();
		return ZStatus.OK;
		this.mode = Mode.METHOD;
	}

	inflate() {
		const { z } = this;
		let b: number;

		if (!z.next_in) {
			return ZStatus.STREAM_ERROR;
		}
		const f = ZStatus.OK;
		let r = ZStatus.BUF_ERROR;
		while (true) {
			switch (this.mode) {
			case Mode.METHOD:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.method = z.next_in[z.next_in_index++];
				if ((this.method & 0xf) !== Z_DEFLATED) {
					this.mode = Mode.BAD;
					z.msg = "unknown compression method";
					this.marker = 5; // can't try inflateSync
					break;
				}
				if ((this.method >> 4) + 8 > this.wbits) {
					this.mode = Mode.BAD;
					z.msg = "invalid window size";
					this.marker = 5; // can't try inflateSync
					break;
				}
				this.mode = Mode.FLAG;
				/* falls through */

			case Mode.FLAG:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				b = (z.next_in[z.next_in_index++]) & 0xff;

				if ((((this.method << 8) + b) % 31) !== 0) {
					this.mode = Mode.BAD;
					z.msg = "incorrect header check";
					this.marker = 5; // can't try inflateSync
					break;
				}

				if ((b & PRESET_DICT) === 0) {
					this.mode = Mode.BLOCKS;
					break;
				}
				this.mode = Mode.DICT4;
				/* falls through */

			case Mode.DICT4:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.need = ((z.next_in[z.next_in_index++] & 0xff) << 24) & 0xff000000;
				this.mode = Mode.DICT3;
				/* falls through */
			case Mode.DICT3:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.need += ((z.next_in[z.next_in_index++] & 0xff) << 16) & 0xff0000;
				this.mode = Mode.DICT2;
				/* falls through */
			case Mode.DICT2:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.need += ((z.next_in[z.next_in_index++] & 0xff) << 8) & 0xff00;
				this.mode = Mode.DICT1;
				/* falls through */
			case Mode.DICT1:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.need += (z.next_in[z.next_in_index++] & 0xff);
				this.mode = Mode.DICT0;
				return ZStatus.NEED_DICT;

			case Mode.DICT0:
				this.mode = Mode.BAD;
				z.msg = "need dictionary";
				this.marker = 0; // can try inflateSync
				return ZStatus.STREAM_ERROR;

			case Mode.BLOCKS:
				r = this.blocks.proc(z, r);
				if (r === ZStatus.DATA_ERROR) {
					this.mode = Mode.BAD;
					this.marker = 0; // can try inflateSync
					break;
				}
				if (r !== ZStatus.STREAM_END) {
					return r;
				}
				r = f;
				this.blocks.reset();
				this.mode = Mode.DONE;
				/* falls through */
			case Mode.DONE:
				return ZStatus.STREAM_END;
			case Mode.BAD:
				return ZStatus.DATA_ERROR;
			default:
				return ZStatus.STREAM_ERROR;
			}
		}
	}

	inflateSetDictionary(dictionary: Uint8Array, dictLength: number) {
		if (this.mode !== Mode.DICT0) {
			return ZStatus.STREAM_ERROR;
		}

		let index = 0;
		let length = dictLength;

		if (length >= (1 << this.wbits)) {
			length = (1 << this.wbits) - 1;
			index = dictLength - length;
		}
		this.blocks.set_dictionary(dictionary, index, length);
		this.mode = Mode.BLOCKS;
		return ZStatus.OK;
	}

	inflateSync() {
		const { z } = this;

		let n; // number of bytes to look at
		let p; // pointer to bytes
		let m; // number of marker bytes found in a row
		let r, w; // temporaries to save total_in and total_out

		// set up
		if (!z || !this) {
			return ZStatus.STREAM_ERROR;
		}
		if (this.mode !== Mode.BAD) {
			this.mode = Mode.BAD;
			this.marker = 0;
		}
		n = z.avail_in;
		if (n === 0) {
			return ZStatus.BUF_ERROR;
		}
		p = z.next_in_index;
		m = this.marker;

		// search
		while (n !== 0 && m < 4) {
			if (z.next_in[p] === mark[m]) {
				m++;
			} else if (z.next_in[p] !== 0) {
				m = 0;
			} else {
				m = 4 - m;
			}
			p++;
			n--;
		}

		// restore
		z.total_in += p - z.next_in_index;
		z.next_in_index = p;
		z.avail_in = n;
		this.marker = m;

		// return no joy or set up to restart on a new block
		if (m !== 4) {
			return ZStatus.DATA_ERROR;
		}
		r = z.total_in;
		w = z.total_out;
		this.reset();
		z.total_in = r;
		z.total_out = w;
		this.mode = Mode.BLOCKS;
		return ZStatus.OK;
	}
}
