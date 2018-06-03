// Definition file for the inflate.js file
// Part of Stardazed
// (c) 2015-2016 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/sd-inflate

// inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
// See: https://gildas-lormeau.github.io/zip.js/

interface Inflater {
	/**
	 * Add more data to be decompressed.
	 *
	 * @param data A Uint8 view of the compressed data.
	 */
	append(data: Uint8Array): Uint8Array;
}

interface InflaterConstructor {
	(): Inflater;
}

declare const Inflater: InflaterConstructor;
