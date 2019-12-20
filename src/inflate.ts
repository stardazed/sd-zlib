/**
 * gzip/inflate - class interface to inflate algorithm
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

import { ZLimits, ZStatus, u8ArrayFromBufferSource } from "./common";
import { ZStream } from "./zstream";
import { InfBlocks } from "./infblocks";
import { adler32 } from "./adler32";

// preset dictionary flag in zlib header
const PRESET_DICT = 0x20;
const Z_DEFLATED = 8;

const GZIP_ID1 = 0x1F;
const GZIP_ID2 = 0x8B;

const enum Mode {
	// shared / gzip
	DETECT = 0,
	ID2 = 1,

	// shared
	METHOD = 2, // waiting for method byte
	FLAG = 3, // waiting for flag byte

	// deflate onlt
	DICT4 = 4, // four dictionary check bytes to go
	DICT3 = 5, // three dictionary check bytes to go
	DICT2 = 6, // two dictionary check bytes to go
	DICT1 = 7, // one dictionary check byte to go
	DICT0 = 8, // waiting for inflateSetDictionary

	// gzip only
	MTIME0 = 9,
	MTIME1 = 10,
	MTIME2 = 11,
	MTIME3 = 12,
	XFLAGS = 13,
	OS = 14,
	EXTRA0 = 15,
	EXTRA1 = 16,
	EXTRA = 17,
	NAME = 18,
	COMMENT = 19,
	HCRC0 = 20,
	HCRC1 = 21,

	// shared
	BLOCKS = 22, // decompressing blocks
	CHKSUM0 = 23,
	CHKSUM1 = 24,
	CHKSUM2 = 25,
	CHKSUM3 = 26,

	// gzip only
	ISIZE0 = 27,
	ISIZE1 = 28,
	ISIZE2 = 29,
	ISIZE3 = 30,

	DONE = 31, // finished check, done
	BAD = 32, // got an error--stay here
}

const enum GFlags {
	FTEXT = 0x01,
	FHCRC = 0x02,
	FEXTRA = 0x04,
	FNAME = 0x08,
	FCOMMENT = 0x10,
}

export class Inflate {
	private mode: Mode; // current inflate mode
	private isGZip = false; // are we dealing with a gzip stream?

	// mode dependent information
	private method = 0; // if FLAGS, method byte
	private gflags = 0; // if in gzip mode and after FLAG, then contains gzip flags
	private name = "";
	private dictChecksum = 0; // expected checksum of external dictionary
	private fullChecksum = 0; // expected checksum of original data
	private inflatedSize = 0; // size in bytes of original data

	// mode independent information
	private wbits = 0; // log2(window size) (8..15, defaults to 15)

	private blocks: InfBlocks; // current inflate_blocks state

	constructor(blocksOnly: boolean) {
		this.wbits = ZLimits.MAX_BITS;
		this.blocks = new InfBlocks(1 << this.wbits);
		this.mode = blocksOnly ? Mode.BLOCKS : Mode.DETECT;
	}

	get isComplete() {
		const { blocks } = this;
		const blocksComplete = (blocks.mode === 0 || blocks.mode === 8) && blocks.bitb === 0 && blocks.bitk === 0;
		return this.mode === Mode.DONE && blocksComplete;
	}

	get fileName() {
		return this.name;
	}

	get checksum() {
		return this.fullChecksum;
	}

	get fullSize() {
		return this.inflatedSize;
	}

	inflate(z: ZStream) {
		let b: number;

		if (!z || !z.next_in) {
			return ZStatus.STREAM_ERROR;
		}
		const f = ZStatus.OK;
		let r = ZStatus.BUF_ERROR;
		while (true) {
			switch (this.mode) {
			case Mode.DETECT:
				if (z.avail_in === 0) {
					return r;
				}
				b = z.next_in[z.next_in_index];
				if (b !== GZIP_ID1) {
					this.mode = Mode.METHOD;
					break;
				}
				this.mode = Mode.ID2;
				r = f;
				z.avail_in--;
				z.total_in++;
				z.next_in_index++;
				/* falls through */

			case Mode.ID2:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				b = z.next_in[z.next_in_index++];
				if (b !== GZIP_ID2) {
					this.mode = Mode.BAD;
					z.msg = "invalid gzip id";
					break;
				}
				this.isGZip = true;
				this.mode = Mode.METHOD;
				/* falls through */

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
					break;
				}
				if ((this.method >> 4) + 8 > this.wbits) {
					this.mode = Mode.BAD;
					z.msg = "invalid window size";
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

				if (this.isGZip) {
					this.gflags = b;
					this.mode = Mode.MTIME0;
					break;
				}

				if ((((this.method << 8) + b) % 31) !== 0) {
					this.mode = Mode.BAD;
					z.msg = "incorrect header check";
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
				this.dictChecksum = ((z.next_in[z.next_in_index++] & 0xff) << 24) & 0xff000000;
				this.mode = Mode.DICT3;
				/* falls through */
			case Mode.DICT3:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.dictChecksum |= ((z.next_in[z.next_in_index++] & 0xff) << 16) & 0xff0000;
				this.mode = Mode.DICT2;
				/* falls through */
			case Mode.DICT2:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.dictChecksum |= ((z.next_in[z.next_in_index++] & 0xff) << 8) & 0xff00;
				this.mode = Mode.DICT1;
				/* falls through */
			case Mode.DICT1:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				this.dictChecksum |= (z.next_in[z.next_in_index++] & 0xff);
				this.mode = Mode.DICT0;
				return ZStatus.NEED_DICT;

			case Mode.DICT0:
				this.mode = Mode.BAD;
				z.msg = "need dictionary";
				return ZStatus.STREAM_ERROR;

			case Mode.MTIME0:
			case Mode.MTIME1:
			case Mode.MTIME2:
			case Mode.MTIME3:
			case Mode.XFLAGS:
			case Mode.OS:
				// track but skip
				if (z.avail_in === 0) {
					return r;
				}
				r = f;

				z.avail_in--;
				z.total_in++;
				z.next_in_index++;

				if (this.mode === Mode.OS) {
					if (this.gflags & GFlags.FEXTRA) {
						this.mode = Mode.EXTRA0;
					}
					else if (this.gflags & GFlags.FNAME) {
						this.mode = Mode.NAME;
					}
					else if (this.gflags & GFlags.FCOMMENT) {
						this.mode = Mode.COMMENT;
					}
					else if (this.gflags & GFlags.FHCRC) {
						this.mode = Mode.HCRC0;
					}
					else {
						this.mode = Mode.BLOCKS;
					}
				}
				else {
					this.mode++;
				}
				break;

			case Mode.EXTRA0:
			case Mode.EXTRA1:
			case Mode.EXTRA1:
			case Mode.HCRC0:
			case Mode.HCRC1:
				this.mode = Mode.BAD;
				z.msg = "unsupported field";
				break;

			case Mode.NAME:
			case Mode.COMMENT:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;
				z.avail_in--;
				z.total_in++;
				b = (z.next_in[z.next_in_index++]) & 0xff;
				if (b !== 0) {
					if (this.mode === Mode.NAME) {
						this.name += String.fromCharCode(b);
					}
				}
				else {
					if ((this.mode !== Mode.COMMENT) && (this.gflags & GFlags.FCOMMENT)) {
						this.mode = Mode.COMMENT;
					}
					else if (this.gflags & GFlags.FHCRC) {
						this.mode = Mode.HCRC0;
					}
					else {
						this.mode = Mode.BLOCKS;
					}
				}
				break;

			case Mode.BLOCKS:
				r = this.blocks.proc(z, r);
				if (r === ZStatus.DATA_ERROR) {
					this.mode = Mode.BAD;
					break;
				}
				if (r !== ZStatus.STREAM_END) {
					return r;
				}
				r = f;
				this.blocks.reset();

				// if no headers were parsed then also skip any potential trailers
				if (this.method === 0) {
					this.mode = Mode.DONE;
					break;
				}
				this.mode = Mode.CHKSUM0;
				/* falls through */

			case Mode.CHKSUM0:
			case Mode.CHKSUM1:
			case Mode.CHKSUM2:
			case Mode.CHKSUM3:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;
				z.avail_in--;
				z.total_in++;
				b = (z.next_in[z.next_in_index++]) & 0xff;
				if (this.isGZip) {
					// CRC32 is stored in LSB order
					this.fullChecksum = (this.fullChecksum >>> 8) | (b << 24);
				}
				else {
					// ADLER32 is stored in MSB order
					this.fullChecksum = (this.fullChecksum << 8) | b;
				}
				this.mode++;

				// deflate does not have the inflated size field
				if (this.mode === Mode.ISIZE0 && (! this.isGZip)) {
					this.mode = Mode.DONE;
				}
				break;

			case Mode.ISIZE0:
			case Mode.ISIZE1:
			case Mode.ISIZE2:
			case Mode.ISIZE3:
				if (z.avail_in === 0) {
					return r;
				}
				r = f;
				z.avail_in--;
				z.total_in++;
				b = (z.next_in[z.next_in_index++]) & 0xff;
				this.inflatedSize = (this.inflatedSize >>> 8) | (b << 24);
				this.mode++;
				break;

			case Mode.DONE:
				return ZStatus.STREAM_END;
			case Mode.BAD:
				return ZStatus.DATA_ERROR;
			default:
				return ZStatus.STREAM_ERROR;
			}
		}
	}

	inflateSetDictionary(dictSource: BufferSource) {
		if (this.mode !== Mode.DICT0) {
			return ZStatus.STREAM_ERROR;
		}

		const dictionary = u8ArrayFromBufferSource(dictSource);
		if (! dictionary) {
			return ZStatus.DATA_ERROR;
		}

		let index = 0;
		let length = dictionary.byteLength;

		if (length >= (1 << this.wbits)) {
			length = (1 << this.wbits) - 1;
			index = dictionary.byteLength - length;
		}

		// verify dictionary checksum
		const checksum = adler32(dictionary);
		if (checksum !== this.dictChecksum) {
			// wrong checksum, don't use and report error
			return ZStatus.DATA_ERROR;
		}

		this.blocks.set_dictionary(dictionary, index, length);
		this.mode = Mode.BLOCKS;
		return ZStatus.OK;
	}
}
