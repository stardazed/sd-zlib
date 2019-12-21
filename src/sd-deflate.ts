/**
 * gzip/sd-deflate - deflate external API
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 */

import { ZStatus, ZFlush, ZStrategy } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Deflate } from "./deflate";
import { adler32 } from "./adler32";

export interface DeflaterOptions {
	/**
	 * Specify what headers and footers should be written
	 * to the ouput file. One of `raw` (no headers, just data)
	 * `deflate` (2-byte header, adler checksum) or `gzip`
	 * (file headers, crc checksum and size check)
	 * @default "deflate"
	 */
	container?: "raw" | "deflate" | "gzip";

	/**
	 * Deflate compression level (1 through 9).
	 * Higher level generally means better compression but
	 * also longer execution time.
	 * @default 6
	 */
	level?: number;
}

export class Deflater {
	private deflate: Deflate;
	private z: ZStream;
	private checksum = 1;

	constructor(options?: DeflaterOptions) {
		const level = options?.level ?? 6;

		this.z = new ZStream();
		this.deflate = new Deflate(this.z, level, ZStrategy.DEFAULT_STRATEGY);
	}

	append(data: Uint8Array) {
		if (!data.length) {
			return;
		}

		// update checksum
		this.checksum = adler32(data, this.checksum);

		const buffers: Uint8Array[] = [];
		const { deflate, z } = this;

		z.next_in_index = 0;
		z.next_in = data;
		z.avail_in = data.length;

		do {
			z.next_out_index = 0;
			z.avail_out = OUTPUT_BUFSIZE;
			const err = deflate.deflate(ZFlush.NO_FLUSH);
			if (err !== ZStatus.OK) {
				throw new Error("deflating: " + z.msg);
			}
			if (z.next_out_index) {
				buffers.push(new Uint8Array(z.next_out.subarray(0, z.next_out_index)));
			}
		} while (z.avail_in > 0 || z.avail_out === 0);

		return buffers;
	}

	finish() {
		const buffers: Uint8Array[] = [];
		const { deflate, z } = this;

		do {
			z.next_out_index = 0;
			z.avail_out = OUTPUT_BUFSIZE;
			const err = deflate.deflate(ZFlush.FINISH);
			if (err !== ZStatus.STREAM_END && err !== ZStatus.OK) {
				throw new Error("deflating: " + z.msg);
			}
			if (OUTPUT_BUFSIZE - z.avail_out > 0) {
				buffers.push(new Uint8Array(z.next_out.subarray(0, z.next_out_index)));
			}
		} while (z.avail_in > 0 || z.avail_out === 0);

		// append checksum in trailing buffer
		const trailer = new ArrayBuffer(4);
		const dv = new DataView(trailer);
		dv.setInt32(0, this.checksum, false);
		buffers.push(new Uint8Array(trailer));

		return buffers;
	}
}
