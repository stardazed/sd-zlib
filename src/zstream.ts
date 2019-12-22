/**
 * zlib/zstream - i/o data stream structure
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-zlib
 *
 * Based on zip.js (c) 2013 by Gildas Lormeau
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

export const OUTPUT_BUFSIZE = 16384;

export interface ZPendingBuffer {
	pending_buf: Uint8Array; // output still pending
	pending: number; // nb of bytes in the pending buffer
	pending_out: number; // next pending byte to output to the stream
}

export class ZStream {
	next_in!: Uint8Array;
	avail_in: number;
	next_in_index: number;

	total_in: number;

	readonly next_out: Uint8Array;
	avail_out: number;
	next_out_index: number;

	total_out: number;

	msg: string;

	constructor() {
		this.avail_in = 0;
		this.next_in_index = 0;

		this.next_out = new Uint8Array(OUTPUT_BUFSIZE);
		this.avail_out = this.next_out.byteLength;
		this.next_out_index = 0;

		this.total_in = this.total_out = 0;
		this.msg = "";
	}

	append(data: Uint8Array) {
		this.next_in = data;
		this.avail_in = data.length;
		this.next_in_index = 0;
	}

	read_buf(start: number, size: number) {
		return this.next_in.subarray(start, start + size);
	}

	read_into_buf(buf: Uint8Array, start: number, size: number) {
		let len = this.avail_in;
		if (len > size)
			len = size;
		if (len === 0)
			return 0;

		buf.set(this.next_in.subarray(this.next_in_index, this.next_in_index + len), start);

		this.avail_in -= len;
		this.next_in_index += len;
		this.total_in += len;

		return len;
	}

	// Flush as much pending output as possible. All deflate() output goes
	// through this function so some applications may wish to modify it
	// to avoid allocating a large strm->next_out buffer and copying into it.
	// (See also read_buf()).
	flush_pending(dstate: ZPendingBuffer) {
		var len = dstate.pending;

		if (len > this.avail_out)
			len = this.avail_out;
		if (len === 0)
			return;

		this.next_out.set(dstate.pending_buf.subarray(dstate.pending_out, dstate.pending_out + len), this.next_out_index);

		this.next_out_index += len;
		dstate.pending_out += len;
		this.total_out += len;
		this.avail_out -= len;
		dstate.pending -= len;
		if (dstate.pending === 0) {
			dstate.pending_out = 0;
		}
	}
}
