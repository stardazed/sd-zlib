sd-inflate
==========
Decompress data compressed with zlib.
Supports optional DEFLATE headers and preset dictionaries.

Installation
------------
**⚠️ Important**: This package, like everything in the @stardazed org,
is distributed as an ES2015 module and is intended for use in browsers,
not in NodeJS per se. Browser-specific types may be used.

`yarn add @stardazed/inflate`

or

`npm install --save @stardazed/inflate`

Usage (normal)
--------------
```ts
/**
 * inflate does the right thing for almost all situations and provides
 * a simple, Promise-based way to inflate data. It detects any headers
 * and will act appropriately. Unless you need more control over the
 * inflate process, it is recommended to use this function.
 * @param data The deflated data
 * @param presetDict Optional preset deflate dictionary
 * @returns A promise to the re-inflated data
 */
function inflate(data: Uint8Array | Uint8ClampedArray, presetDict?: Uint8Array | Uint8ClampedArray): Promise<Uint8Array>;
```

Usage (advanced)
----------------
```ts
interface InflaterOptions {
	/**
	 * If set, the DEFLATE header and optional preset dictionary
	 * checksum will be parsed and verified.
	 * Set to false if you only have the compressed data, e.g.
	 * of a gzip file.
	 * @default true
	 */
	dataIncludesHeader: boolean;

	/**
	 * If set to true, then you can call {{finish}} mid-stream.
	 * This is only useful if you know you have incomplete data.
	 * @default false
	 */
	allowPartialData: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * Only used if the data indicates it needs an external dictionary.
	 * If used, the Adler32 checksum of the dictionary is verified
	 * against the checksum stored in the deflated data.
	 * If {{dataIncludesHeader}} is false, then this is ignored.
	 * @default undefined
	 */
	presetDictionary: Uint8Array | Uint8ClampedArray;
}

class Inflater {
	constructor(options?: Partial<InflaterOptions>);

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param data A Uint8 view of the compressed data.
	 * @throws {Error} Will throw in case of bad data
	 */
	append(data: Uint8Array | Uint8ClampedArray): void;

	/**
	 * Complete the inflate action and return the resulting
	 * data.
	 * @throws {Error} If the data is incomplete and you did
	 * not set allowPartialData in the constructor.
	 */
	finish(): Uint8Array;
}
```

Copyright
---------
Based on zlib Copyright (c) 1995-2018 Jean-loup Gailly and Mark Adler<br>
inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
See: https://gildas-lormeau.github.io/zip.js/<br>
inflate.js is based on JZlib 1.0.2 ymnk, JCraft,Inc.<br>
(c) Arthur Langereis (@zenmumbler): conversion to TypeScript, modularized,
modernized, optimized and extended<br>

License
-------
[zlib](https://www.zlib.net/zlib_license.html)
