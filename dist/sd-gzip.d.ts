/**
 * @stardazed/gzip - GZip library implementation
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

/**
* Compute the Adler-32 checksum of a buffer source
* @param data Source data, a BufferSource
* @param seed Optional seed for the checksum
*/
export declare function adler32(source: BufferSource, seed?: number): number;

/**
 * Compute the CRC-32 checksum of a buffer source
 * @param source Source data, a BufferSource
 * @param seed Optional seed for the checksum
 */
export function crc32(source: BufferSource, seed?: number): number;

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
	constructor(options?: InflaterOptions);

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param data a buffer or bufferview containing compressed data
	 */
	append(data: BufferSource): Uint8Array[];

	/**
	 * Complete the inflate action and return the result of all possible
	 * sanity checks and some metadata when available.
	 */
	finish(): InflateResult;
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
export function inflate(data: BufferSource, deflateDictionary?: BufferSource);

export function mergeBuffers(buffers: Uint8Array[]);
