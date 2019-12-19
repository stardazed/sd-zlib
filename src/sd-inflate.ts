/**
 * gzip/sd-inflate - inflate external API
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 */

import { ZStatus } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Inflate } from "./inflate";

export interface InflaterOptions {
	/**
	 * If set, the DEFLATE header and optional preset dictionary
	 * checksum will be parsed and verified.
	 * Set to false if you only have the compressed data, e.g.
	 * of a gzip file.
	 * @default true
	 */
	dataIncludesHeader?: boolean;

	/**
	 * If set to true, then you can call {{finish}} mid-stream.
	 * This is only useful if you know you have incomplete data.
	 * @default false
	 */
	allowPartialData?: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * Only used if the data indicates it needs an external dictionary.
	 * If used, the Adler32 checksum of the dictionary is verified
	 * against the checksum stored in the deflated data.
	 * If {{dataIncludesHeader}} is false, then this is ignored.
	 * @default undefined
	 */
	presetDictionary?: Uint8Array;
}

export class Inflater {
	private inflate: Inflate;
	private z: ZStream;
	private customDict: Uint8Array | undefined;
	private allowPartialData: boolean;
	private buffers: Uint8Array[];

	constructor(options?: InflaterOptions) {
		options = options || {};
		const parseHeader = options.dataIncludesHeader === undefined ? true : !!options.dataIncludesHeader;
		this.allowPartialData = options.allowPartialData === undefined ? false : !!options.allowPartialData;

		if (options.presetDictionary !== undefined && !(options.presetDictionary instanceof Uint8Array)) {
			throw new TypeError("options.presetDictionary must be undefined or a Uint8Array");
		}

		this.inflate = new Inflate(parseHeader);
		this.z = new ZStream();
		this.customDict = options.presetDictionary;
		this.buffers = [];
	}

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param chunk a Uint8Array containing compressed data
	 */
	append(chunk: Uint8Array) {
		if (! (chunk instanceof Uint8Array)) {
			throw new TypeError("data must be a Uint8Array");
		}
		if (chunk.length === 0) {
			return;
		}

		const { inflate, z, buffers } = this;
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
					throw new Error("inflating: bad input");
				}
			}
			else if (err === ZStatus.NEED_DICT) {
				if (this.customDict) {
					const dictErr = inflate.inflateSetDictionary(this.customDict);
					if (dictErr !== ZStatus.OK) {
						throw new Error("Custom dictionary is invalid for this data");
					}
				}
				else {
					throw new Error("Custom dictionary required");
				}
			}
			else if (err !== ZStatus.OK && err !== ZStatus.STREAM_END) {
				throw new Error("inflating: " + z.msg);
			}
			if ((nomoreinput || err === ZStatus.STREAM_END) && (z.avail_in === chunk.length)) {
				throw new Error("inflating: bad input");
			}
			if (z.next_out_index) {
				if (z.next_out_index === OUTPUT_BUFSIZE) {
					buffers.push(new Uint8Array(z.next_out));
				}
				else {
					buffers.push(new Uint8Array(z.next_out.subarray(0, z.next_out_index)));
				}
			}
		} while (z.avail_in > 0 || z.avail_out === 0);
	}

	private mergeBuffers(buffers: Uint8Array[]) {
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
	 * Complete the inflate action and return the resulting
	 * data.
	 * @throws {Error} If the data is incomplete and you did
	 * not set allowPartialData in the constructor.
	 */
	finish() {
		if (! this.inflate.isComplete && ! this.allowPartialData) {
			throw new Error("Cannot finish inflating incomplete data.");
		}

		return this.mergeBuffers(this.buffers);
	}

	get fileName() {
		return this.inflate.fileName;
	}

	get checksum() {
		return this.inflate.checksum;
	}

	get fullSize() {
		return this.inflate.fullSize;
	}
}

/**
 * inflate does the right thing for almost all situations and provides
 * a simple, Promise-based way to inflate data. It detects any headers
 * and will act appropriately. Unless you need more control over the
 * inflate process, it is recommended to use this function.
 * @param data the deflated data
 * @param presetDict optional preset deflate dictionary
 * @returns a promise to the re-inflated data
 */
export function inflate(data: Uint8Array, presetDict?: Uint8Array) {
	return new Promise<Uint8Array>(resolve => {
		if (! (data instanceof Uint8Array)) {
			throw new TypeError("data must be a Uint8Array");
		}
		if (data.length < 2) {
			throw new TypeError("data buffer is invalid");
		}

		const options: InflaterOptions = {
			presetDictionary: presetDict
		};

		// check for a deflate header
		const [method, flag] = data;
		options.dataIncludesHeader = (method === 0x78 && (flag === 1 || flag === 0x20));

		// single chunk inflate
		const inflater = new Inflater(options);
		inflater.append(data);
		resolve(inflater.finish());
	});
}
