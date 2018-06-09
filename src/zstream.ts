// ZStream
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name

export const OUTPUT_BUFSIZE = 16384;

export class ZStream {
	next_in!: Uint8Array | Uint8ClampedArray;
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

	append(data: Uint8Array | Uint8ClampedArray) {
		this.next_in = data;
		this.avail_in = data.length;
		this.next_in_index = 0;
	}

	read_buf(start: number, size: number) {
		return this.next_in.subarray(start, start + size);
	}
}
