/*
@stardazed/zlib - Zlib library implementation
Part of Stardazed
(c) 2018-Present by @zenmumbler
https://github.com/stardazed/sd-zlib

Based on zip.js (c) 2013 by Gildas Lormeau
Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
*/

export interface InflaterOptions {
	/**
	 * Set to `true` if you only have the compressed data,
	 * mostly for advanced embedding use cases.
	 * @default false
	 */
	raw?: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary for
	 * deflate format sources that were compressed with the same
	 * dictionary. (advanced use case)
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

export declare class Inflater {
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
 * inflate provides a simple way to inflate (decompress) data.
 * It auto-detects the data format and will act appropriately.
 * @param data a buffer or buffer view on the deflated data
 * @param dictionary optional preset DEFLATE dictionary
 * @returns the decompressed data
 */
export function inflate(data: BufferSource, dictionary?: BufferSource): Uint8Array;

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
	 * Provide an optional precalculated lookup dictionary
	 * for `deflate` format files. Advanced use case, can result
	 * in slightly smaller files and improved compression time.
	 * @default undefined
	 */
	dictionary?: BufferSource;

	/**
	 * Provide an optional file name for the data being compressed.
	 * Only affects output if format is set to `gzip`.
	 * @default undefined
	 */
	fileName?: string;
}

export declare class Deflater {
	constructor(options?: DeflaterOptions);

	/**
	 * Add more data to be compressed. Call this as many times as
	 * needed to add more data the the ouptut.
	 * @param data a buffer or bufferview
	 * @returns an array of zero or more Uint8Arrays of compressed data
	 */
	append(data: BufferSource): Uint8Array[];

	/**
	 * Signal that you have added all the data to be compressed.
	 * @param data a buffer or bufferview
	 * @returns an array of zero or more Uint8Arrays of compressed data
	 */
	finish(): Uint8Array[];
}

/**
 * deflate provides a simple way to deflate (compress) data.
 * Use this function if you have a single buffer that needs to be compressed.
 * @param data a buffer or buffer view on the data to be compressed
 * @param options optionally provide compression settings and file metadata
 * @returns the compressed data
 */
export function deflate(data: BufferSource, options?: DeflaterOptions): Uint8Array;

/**
 * Append an array of buffers together into one single buffer.
 */
export function mergeBuffers(buffers: Uint8Array[]): Uint8Array;

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

