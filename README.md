@stardazed/zip
==============
Decompresses data compressed with zlib, currently only decompression of `deflate` buffers.
Supports optional DEFLATE headers and preset dictionaries.

Installation
------------
```
pnpm add @stardazed/zip
npm install @stardazed/zip
yarn add @stardazed/zip
```

Usage
-----
In most cases, just call `inflate` on deflated data and you're done. This call
will correctly interpret and handle a DEFLATE header if it is present.

⚠️ **Important**: Gzip headers are not currently supported, you must provide
the buffer without any gzip headers.

```js
import { inflate } from "@stardazed/zip";

const deflatedData = /* must be a Uint8Array */;
inflate(deflatedData).then(
	data => /* act on inflated buffer */,
	error => /* the data was incomplete or invalid */
);
```

If you want more control over the process, including streaming in data chunks
as you receive them, then use the `Inflater` class.

The `Inflater` class takes the following options:

`dataIncludesHeader`: boolean (default `true`)<br>
If set, the DEFLATE header and optional preset dictionary checksum will be
parsed and verified. Set to `false` if you only have the compressed data,
e.g. of a gzip file.

`allowPartialData`: boolean (default: `false`)<br>
If set to true, then you can call `finish` mid-stream. This is only useful
if you know you have incomplete data.

`presetDictionary`: Uint8Array (default: `undefined`)<br>
Provide an optional precalculated lookup dictionary. Only used if the data
indicates it needs an external dictionary in the DEFLATE header.
If used, the Adler32 checksum of the dictionary is verified against the
checksum stored in the deflated data. If `dataIncludesHeader` is `false`,
then this is ignored.


```js
import { Inflater } from "@stardazed/inflate";

const inflater = new Inflater(options /* see above */);

// then, each time a new chunk of data becomes available:
inflater.append(compressedData) // compressedData must be an Uint8Array
	.then(buffers => {
		// buffers is an array of 0 or more Uint8Array buffers
	})
	.catch(error => {
		// handle error
	});

// when all data has been appended:
inflater.finish()
	.then(() => {
		// all is well, close up on your end
	})
	.catch(error) {
		// an error will be returned if the deflated data was incomplete
		// and you did not specify allowPartialData in the options
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
