/**
 * gzip/sd-inflate - inflate external API
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 */

import { ZStatus, u8ArrayFromBufferSource } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Inflate, ContainerFormat } from "./inflate";
import { crc32 } from "./crc32";
import { adler32 } from "./adler32";

export interface InflaterOptions {
	/**
	 * If set, headers and trailers will be assumed to be missing.
	 * Set to true if you only have the raw compressed data.
	 * Since checksums and other metadata is unavaiable when this is
	 * set, no validity checking on the resulting data.
	 * @default false
	 */
	noHeadersOrTrailers?: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * Only used if the data indicates it needs an external dictionary.
	 * If used, the Adler32 checksum of the dictionary is verified
	 * against the checksum stored in the deflated data.
	 * If {{dataIncludesHeader}} is false, then this is ignored.
	 * If the data is in gzip format, then this is ignored
	 * @default undefined
	 */
	deflateDictionary?: BufferSource;
}

export interface InflateResult {
	success: boolean;
	complete: boolean;
	checkSum: "match" | "mismatch" | "unchecked";
	fileSize: "match" | "mismatch" | "unchecked";
	fileName: string;
}

export class Inflater {
	private inflate: Inflate;
	private z: ZStream;
	private customDict: BufferSource | undefined;
	private checksum: number | undefined;

	constructor(options?: InflaterOptions) {
		options = options || {};
		if (options.noHeadersOrTrailers !== undefined && options.noHeadersOrTrailers !== true && options.noHeadersOrTrailers !== false)  {
			throw new TypeError("options.noHeadersOrTrailers must be undefined or true or false");
		}
		const blocksOnly = options.noHeadersOrTrailers === undefined ? false : options.noHeadersOrTrailers;

		if (options.deflateDictionary !== undefined) {
			if (blocksOnly) {
				throw new RangeError("options.presetDictionary cannot be set when options.noHeadersOrTrailers is true");
			}
			if (u8ArrayFromBufferSource(options.deflateDictionary) === undefined) {
				throw new TypeError("options.presetDictionary must be undefined or a buffer or a buffer view");
			}
			this.customDict = options.deflateDictionary;
		}

		this.inflate = new Inflate(blocksOnly);
		this.z = new ZStream();
		this.customDict = options.deflateDictionary;
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

		const checkSum = (storedChecksum === 0) ? "unchecked" : (storedChecksum === this.checksum ? "match" : "mismatch");
		const fileSize = (storedSize === 0) ? "unchecked" : (storedSize === this.z.total_out ? "match" : "mismatch");
		const success = complete && checkSum !== "mismatch" && fileSize !== "mismatch";

		const fileName = this.inflate.fileName;

		return {
			success,
			complete,
			checkSum,
			fileSize,
			fileName
		};
	}
}

export function mergeBuffers(buffers: Uint8Array[]) {
	const totalSize = buffers.map(b => b.byteLength).reduce((s, l) => s + l, 0);
	const output = new Uint8Array(totalSize);

	let offset = 0;
	for (const buf of buffers) {
		output.set(buf, offset);
		offset += buf.length;
	}
	return output;
}

/**
 * inflate does the right thing for almost all situations and provides
 * a simple, Promise-based way to inflate data. It detects any headers
 * and will act appropriately. Unless you need more control over the
 * inflate process, it is recommended to use this function.
 * @param data a buffer or buffer view on the deflated data
 * @param deflateDictionary optional preset DEFLATE dictionary
 * @returns a promise to the re-inflated data
 */
export function inflate(data: BufferSource, deflateDictionary?: BufferSource) {
	return new Promise<Uint8Array>((resolve, reject) => {
		const input = u8ArrayFromBufferSource(data);
		if (! (input instanceof Uint8Array)) {
			throw new TypeError("data must be a buffer or buffer view");
		}
		if (input.length < 2) {
			throw new TypeError("data buffer is too small");
		}

		const options: InflaterOptions = {
			deflateDictionary
		};

		// check for a deflate or gzip header
		const [method, flag] = input;
		const startsWithIdent =
			/* DEFLATE */ (method === 0x78 && ((((method << 8) + flag) % 31) === 0)) ||
			/* GZIP */ (method === 0x1F && flag === 0x8B);
		options.noHeadersOrTrailers = !startsWithIdent;

		// single chunk inflate
		const inflater = new Inflater(options);
		const buffers = inflater.append(input);
		const result = inflater.finish();

		if (! result.success) {
			if (! result.complete) {
				return reject("Unexpected EOF during decompression");
			}
			if (result.checkSum === "mismatch") {
				return reject("Data integrity check failed");
			}
			if (result.fileSize === "mismatch") {
				return reject("Data size check failed");
			}
			return reject("Decompression error");
		}

		resolve(mergeBuffers(buffers));
	});
}
