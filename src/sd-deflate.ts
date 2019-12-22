/**
 * zlib/sd-deflate - deflate external API
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-zlib
 *
 * Based on zip.js (c) 2013 by Gildas Lormeau
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

import { ZStatus, ZFlush, ZStrategy, PRESET_DICT, GZIP_ID1, GZIP_ID2, Z_DEFLATED, u8ArrayFromBufferSource, mergeBuffers } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Deflate, DeflateState } from "./deflate";
import { adler32 } from "./adler32";
import { crc32 } from "./crc32";

export interface DeflaterOptions {
	/**
	 * Specify what headers and footers should be written
	 * to the ouput file. One of `raw` (no headers, just data)
	 * `deflate` (2-byte header, adler checksum) or `gzip`
	 * (file headers, crc checksum and size check)
	 * @default "deflate"
	 */
	format?: "raw" | "deflate" | "gzip";

	/**
	 * Deflate compression level (1 through 9).
	 * Higher level generally means better compression but
	 * also longer execution time.
	 * @default 6
	 */
	level?: number;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * If the container is not set to `deflate` format, then this
	 * must not be set or you will get an exception.
	 * @default undefined
	 */
	dictionary?: BufferSource;

	/**
	 * Provide an optional file name for the data being compressed.
	 * Only affects output if format is set to `gzip`.
	 */
	fileName?: string;
}

export class Deflater {
	private deflate: Deflate;
	private z: ZStream;
	private checksum = 1; // initial seed for adler32
	private origSize = 0; // size in bytes of source data
	private dictChecksum = 0;
	private format: "raw" | "deflate" | "gzip";
	private fileName: string;

	constructor(options?: DeflaterOptions) {
		const level = options?.level ?? 6;
		const format = options?.format ?? "deflate";
		const dictionary = options?.dictionary;
		const fileName = options?.fileName;

		if (typeof level !== "number" || level < 1 || level > 9) {
			throw new RangeError("level must be between 1 and 9, inclusive");
		}
		if (format !== "gzip" && format !== "raw" && format !== "deflate") {
			throw new RangeError("container must be one of `raw`, `deflate`, `gzip`");
		}
		if (typeof fileName !== "undefined" && typeof fileName !== "string") {
			throw new TypeError("fileName must be a string");
		}
		this.fileName = fileName || "";

		this.z = new ZStream();
		this.deflate = new Deflate(this.z, level, ZStrategy.DEFAULT_STRATEGY);

		if (dictionary) {
			if (format !== "deflate") {
				throw new TypeError("Can only provide a dictionary for `deflate` containers.");
			}
			const dict = u8ArrayFromBufferSource(dictionary);
			if (! dict) {
				throw new TypeError("dictionary must be an ArrayBuffer or buffer view");
			}
			this.dictChecksum = adler32(dict);
			this.deflate.deflateSetDictionary(dict);
		}

		this.format = format;
		if (this.format === "gzip") {
			this.checksum = 0; // crc32 uses 0 for initial seed
		}
	}

	private buildZlibHeader() {
		let headerSize = 2;
		let check = 1;
		if (this.dictChecksum !== 0) {
			headerSize += 4;
			check = PRESET_DICT;
		}
		const buf = new ArrayBuffer(headerSize);
		const dv = new DataView(buf);

		// CMF, FLAG
		dv.setUint16(0, (0x78 << 8) | check);
		if (this.dictChecksum !== 0) {
			// DICTID
			dv.setUint32(2, this.dictChecksum);
		}
		return new Uint8Array(buf);
	}

	private buildGZipHeader() {
		let flag = 0;
		let fileNameBytes: number[] = [];
		if (this.fileName.length > 0) {
			flag |= 0x08; // FNAME

			// spec says fileName must be iso-latin-1
			// this is simulated here in a very crude way
			fileNameBytes = Array.from(this.fileName)
				.map(c => {
					const cc = c.charCodeAt(0);
					return cc > 0xff ? 95 : cc // 95 = _
				});
			fileNameBytes.push(0); // trailing zero for c-string
		}

		const buf = new ArrayBuffer(10 + fileNameBytes.length);
		const dv = new DataView(buf);

		dv.setUint16(0, (GZIP_ID1 << 8) | GZIP_ID2); // ID1, ID2
		dv.setUint16(2, (Z_DEFLATED << 8) | flag); // CM, FLG

		// MTIME (LSB)
		const time = Math.floor(Date.now() / 1000);
		dv.setUint32(4, time, true);

		dv.setUint16(8, (0 << 8) | 0xff); // XFL, OS

		// fileName (optional)
		const ua = new Uint8Array(buf);
		if (fileNameBytes.length) {
			ua.set(fileNameBytes, 10);
		}

		return ua;
	}

	private buildTrailer() {
		const gzip = this.format === "gzip";
		const size = gzip ? 8 : 4;
		const trailer = new ArrayBuffer(size);
		const dv = new DataView(trailer);

		dv.setUint32(0, this.checksum, gzip);
		if (gzip) {
			dv.setUint32(4, this.origSize, true);
		}
		return new Uint8Array(trailer);
	}

	append(data: BufferSource) {
		const buffers: Uint8Array[] = [];

		const chunk = u8ArrayFromBufferSource(data);
		if (!(chunk instanceof Uint8Array)) {
			throw new TypeError("data must be an ArrayBuffer or buffer view");
		}
		if (! chunk.length) {
			return buffers;
		}

		// update checksum and total size
		if (this.format !== "gzip") {
			this.checksum = adler32(chunk, this.checksum);
		}
		else {
			this.checksum = crc32(chunk, this.checksum);
		}
		this.origSize += chunk.length;

		const { deflate, z } = this;
		z.next_in_index = 0;
		z.next_in = chunk;
		z.avail_in = chunk.length;

		// return any headers first
		if (deflate.status === DeflateState.INIT) {
			if (this.format === "deflate") {
				buffers.push(this.buildZlibHeader());
			}
			else if (this.format === "gzip") {
				buffers.push(this.buildGZipHeader());
			}
		}

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

		if (deflate.status === DeflateState.INIT) {
			throw new Error("Cannot call finish before at least 1 call to append");
		}

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

		if (this.format !== "raw") {
			buffers.push(this.buildTrailer());
		}

		return buffers;
	}
}

/**
 * deflate provides a simple way to deflate (compress) data.
 * Use this function if you have a single buffer that needs to be
 * compressed.
 * @param data a buffer or buffer view on the deflated data
 * @param options optionally provide compression settings and file metadata
 * @returns the compressed data
 */
export function deflate(data: BufferSource, options?: DeflaterOptions) {
	const input = u8ArrayFromBufferSource(data);
	if (!(input instanceof Uint8Array)) {
		throw new TypeError("data must be an ArrayBuffer or buffer view");
	}

	const deflater = new Deflater(options);
	const buffers = deflater.append(data);
	buffers.push(...deflater.finish());

	return mergeBuffers(buffers);
}
