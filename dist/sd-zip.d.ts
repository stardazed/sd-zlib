/**
 * @stardazed/zip - zip algorithm implementation
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-zip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */

/**
* Compute the Adler-32 checksum of the data in a buffer or buffer view.
* @param data Source data, a BufferSource
* @param seed Optional seed for the checksum
*/
export declare function adler32(source: BufferSource, seed?: number): number;


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
	constructor(options?: InflaterOptions);

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param data A Uint8 view of the compressed data.
	 * @throws {Error} Will throw in case of bad data
	 */
	append(data: Uint8Array): void;

	/**
	 * Complete the inflate action and return the resulting
	 * data.
	 * @throws {Error} If the data is incomplete and you did
	 * not set allowPartialData in the constructor.
	 */
	finish(): Uint8Array;
}

/**
 * inflate does the right thing for almost all situations and provides
 * a simple, Promise-based way to inflate data. It detects any headers
 * and will act appropriately. Unless you need more control over the
 * inflate process, it is recommended to use this function.
 * @param data The deflated data buffer
 * @param presetDict Optional preset deflate dictionary
 * @returns A promise to the re-inflated data buffer
 */
export function inflate(data: Uint8Array, presetDict?: Uint8Array): Promise<Uint8Array>;
