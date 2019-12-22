/*
zlib/sd-inflate - inflate external API
Part of Stardazed
(c) 2018-Present by Arthur Langereis - @zenmumbler
https://github.com/stardazed/sd-zlib

Based on zip.js (c) 2013 by Gildas Lormeau
Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
*/

import { ZStatus, u8ArrayFromBufferSource, mergeBuffers } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Inflate, ContainerFormat } from "./inflate";
import { crc32 } from "./crc32";
import { adler32 } from "./adler32";

export interface InflaterOptions {
	/**
	 * If set, headers and trailers will be assumed to be missing.
	 * Set to true if you only have the raw compressed data.
	 * Since checksums and other metadata is unavaiable when this is
	 * set, no validity checking is done on the resulting data.
	 * @default false
	 */
	raw?: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * Only used if the data indicates it needs an external dictionary.
	 * If used, the Adler32 checksum of the dictionary is verified
	 * against the checksum stored in the deflated data.
	 * If {{dataIncludesHeader}} is false, then this is ignored.
	 * If the data is in gzip format, then this is ignored
	 * @default undefined
	 */
	dictionary?: BufferSource;
}

export interface InflateResult {
	/** overall indicator of proper decompression */
	success: boolean;
	/** was the input data complete? */
	complete: boolean;
	/** data validity check result */
	checksum: "match" | "mismatch" | "unchecked";
	/** data size check result (gzip only) */
	fileSize: "match" | "mismatch" | "unchecked";
	/** stored original file name (gzip only, "" otherwise) */
	fileName: string;
	/** stored modifcation date (gzip only) */
	modDate: Date | undefined;
}

export class Inflater {
	private inflate: Inflate;
	private z: ZStream;
	private customDict: BufferSource | undefined;
	private checksum: number | undefined;

	constructor(options?: InflaterOptions) {
		const raw = options?.raw;
		if (raw !== undefined && raw !== true && raw !== false)  {
			throw new TypeError("options.raw must be undefined or true or false");
		}
		const blocksOnly = raw === undefined ? false : raw;

		const dictionary = options?.dictionary;
		if (dictionary !== undefined) {
			if (blocksOnly) {
				throw new RangeError("options.dictionary cannot be set when options.raw is true");
			}
			if (u8ArrayFromBufferSource(dictionary) === undefined) {
				throw new TypeError("options.dictionary must be undefined or a buffer or a buffer view");
			}
			this.customDict = dictionary;
		}

		this.inflate = new Inflate(blocksOnly);
		this.z = new ZStream();
	}

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param data a buffer or bufferview containing compressed data
	 */
	append(data: BufferSource): Uint8Array[] {
		const chunk = u8ArrayFromBufferSource(data);
		if (! (chunk instanceof Uint8Array)) {
			throw new TypeError("data must be an ArrayBuffer or buffer view");
		}
		if (chunk.length === 0) {
			return [];
		}

		const { inflate, z } = this;
		const outBuffers: Uint8Array[] = [];
		let nomoreinput = false;
		z.append(chunk);

		do {
			z.next_out_index = 0;
			z.avail_out = OUTPUT_BUFSIZE;

			if ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it
				z.next_in_index = 0;
				nomoreinput = true;
			}

			const err = inflate.inflate(z);
			if (nomoreinput && (err === ZStatus.BUF_ERROR)) {
				if (z.avail_in !== 0) {
					throw new Error("inflate error: bad input");
				}
			}
			else if (err === ZStatus.NEED_DICT) {
				if (this.customDict) {
					const dictErr = inflate.inflateSetDictionary(this.customDict);
					if (dictErr !== ZStatus.OK) {
						throw new Error("Custom dictionary is not valid for this data");
					}
				}
				else {
					throw new Error("Custom dictionary required for this data");
				}
			}
			else if (err !== ZStatus.OK && err !== ZStatus.STREAM_END) {
				throw new Error("inflate error: " + z.msg);
			}
			if ((nomoreinput || err === ZStatus.STREAM_END) && (z.avail_in === chunk.length)) {
				throw new Error("inflate error: bad input data");
			}
			if (z.next_out_index) {
				const nextBuffer = new Uint8Array(z.next_out.subarray(0, z.next_out_index));

				// update running checksum of output data
				const useCRC = inflate.containerFormat === ContainerFormat.GZip;
				if (this.checksum === undefined) {
					this.checksum = useCRC ? 0 : 1; // initial seeds: crc32 => 0, adler32 => 1
				}
				if (useCRC) {
					this.checksum = crc32(nextBuffer, this.checksum);
				}
				else {
					this.checksum = adler32(nextBuffer, this.checksum);
				}

				outBuffers.push(nextBuffer);
			}
		} while (z.avail_in > 0 || z.avail_out === 0);

		return outBuffers;
	}

	/**
	 * Complete the inflate action and return the result of all possible
	 * sanity checks and some metadata when available.
	 */
	finish(): InflateResult {
		const storedChecksum = this.inflate.checksum;
		const storedSize = this.inflate.fullSize;
		const complete = this.inflate.isComplete;

		const checksum = (storedChecksum === 0) ? "unchecked" : (storedChecksum === this.checksum ? "match" : "mismatch");
		const fileSize = (storedSize === 0) ? "unchecked" : (storedSize === this.z.total_out ? "match" : "mismatch");
		const success = complete && checksum !== "mismatch" && fileSize !== "mismatch";

		const fileName = this.inflate.fileName;
		const modDate = this.inflate.modDate;

		return {
			success,
			complete,
			checksum,
			fileSize,
			fileName,
			modDate
		};
	}
}

/**
 * inflate provides a simple way to inflate (decompress) data.
 * It auto-detects the data format and will act appropriately.
 * @param data a buffer or buffer view on the deflated data
 * @param dictionary optional preset DEFLATE dictionary
 * @returns the decompressed data
 */
export function inflate(data: BufferSource, dictionary?: BufferSource) {
	const input = u8ArrayFromBufferSource(data);
	if (! (input instanceof Uint8Array)) {
		throw new TypeError("data must be an ArrayBuffer or buffer view");
	}
	if (input.length < 2) {
		throw new Error("data buffer is too small");
	}

	const options: InflaterOptions = {
		dictionary
	};

	// check for a deflate or gzip header
	const [method, flag] = input;
	const startsWithIdent =
		/* DEFLATE */ (method === 0x78 && ((((method << 8) + flag) % 31) === 0)) ||
		/* GZIP */ (method === 0x1F && flag === 0x8B);
	options.raw = !startsWithIdent;

	// single chunk inflate
	const inflater = new Inflater(options);
	const buffers = inflater.append(input);
	const result = inflater.finish();

	if (! result.success) {
		if (! result.complete) {
			throw new Error("Unexpected EOF during decompression");
		}
		if (result.checksum === "mismatch") {
			throw new Error("Data integrity check failed");
		}
		if (result.fileSize === "mismatch") {
			throw new Error("Data size check failed");
		}
		throw new Error("Decompression error");
	}

	return mergeBuffers(buffers);
}
