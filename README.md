@stardazed/zlib
===============
Compress and decompress data with the deflate algorithm, and read and
write this data in deflate, gzip or raw format containers.

Installation & Usage
--------------------
```
pnpm add @stardazed/zlib
npm install @stardazed/zlib
yarn add @stardazed/zlib
```

This library comes with a full set of TypeScript types.

In module based workflows import from `@stardazed/zlib`, see examples below.
If your workflow does not support modules then the UMD file is used and
the types will be available from the global `sdZlib` in browsers:

```js
const { Deflater, Inflater, deflate, inflate, adler32, crc32, mergeBuffers } = sdZlib;
```

Error Handling
--------------
Every call in this API, including class constructors, can encounter one
or more errors. Since these errors only occur when data is malformed or when
the API is used incorrectly, these errors will throw exceptions. The examples
below do not show error handling for brevity, but in production code be aware
that all functions can potentially throw.

Decompression
-------------
In most cases, call `inflate` on compressed data and you're done.

```js
import { inflate } from "@stardazed/zlib";

const deflatedData = /* An ArrayBuffer or a buffer view (e.g. Uint8Array) */;
const data = inflate(deflatedData);
```

`inflate` also takes an optional 2nd argument which is the `dictionary`
field in the options listed below.

If you want more control over the process, including streaming in data chunks
as you receive them, then use the `Inflater` class.

The `Inflater` class takes the following options:

`raw`: boolean (default `false`)<br>
Set to `true` if you only have the compressed data, mostly for advanced
embedding use cases.

`dictionary`: BufferSource (default: `undefined`)<br>
Provide an optional precalculated lookup dictionary for deflate format
sources that were compressed with the same dictionary. (advanced use case)

```js
import { Inflater, mergeBuffers } from "@stardazed/zlib";

const inflater = new Inflater(options /* see above */);
const outputs = [];

// then, each time a new chunk of data becomes available:
outputs.push(...inflater.append(compressedData)); // ArrayBuffer or buffer view
// append returns zero or more Uint8Arrays

// use the built-in mergeBuffers utility to merge all outputs together
const data = mergeBuffers(outputs);

// when all data has been appended:
const result = inflater.finish();

// result object layout:
{
    success: boolean; // overall indicator of proper decompression
    complete: boolean; // was the input data complete?
    checksum: "match" | "mismatch" | "unchecked"; // data validity result
    fileSize: "match" | "mismatch" | "unchecked"; // size check result (gzip only)
    fileName: string; // stored original file name (gzip only, "" otherwise)
    modDate: Date | undefined; // stored modification date (gzip only)
}
```

Since the deflate algorithm can handle incomplete data, the result
for broken input streams is not an error, but the details are given
for you to act upon in whatever manner is suitable. Use the `success`
field for most use cases.

⚠️ You cannot reuse an `Inflater` instance, to decompress another source, create
a new `Inflater` instance.

Compression
-----------
In most cases, call `deflate` on some data and you're done.

```js
import { deflate } from "@stardazed/zlib";

const data = /* An ArrayBuffer or a buffer view (e.g. Uint8Array) */;
const compressedData = deflate(data);
```

`deflate` also takes an optional 2nd parameter for options, see below.

If you want to stream in data chunks as you receive them, then use the
`Deflater` class.

The `Deflater` class and the `deflate` function take the following options:

`format`: `"raw" | "deflate" | "gzip"` (default: `"deflate"`)<br>
Specifies what container is to be used for the output. `raw` outputs
no metadata at all.

`fileName`: string (default: `undefined`)<br>
Provide an optional file name for the data being compressed.
Only affects output if format is set to `gzip`.

`level`: 1..9 (default: `6`)<br>
Specifies how hard deflate will try to compress your data. Higher
means smaller but also slower and there are diminishing returns.
The default is almost always the best trade-off.

`dictionary`: BufferSource (default: `undefined`)<br>
Provide an optional precalculated lookup dictionary for `deflate` format
files. Advanced use case, can result in slightly smaller files and
improved compression time.

```js
import { Deflater, mergeBuffers } from "@stardazed/zlib";

const deflater = new Deflater(options /* see above */);
const outputs = [];

// then, each time a new chunk of data becomes available:
outputs.push(...deflater.append(data)); // ArrayBuffer or buffer view
// append returns an array of zero or more Uint8Arrays

// when all data has been appended:
outputs.push(...deflater.finish());
// finish also returns an array of zero or more Uint8Arrays

// use the built-in mergeBuffers utility to merge all outputs together
const compressedData = mergeBuffers(outputs);
```

⚠️ You cannot reuse a `Deflater` instance, to compress another source, create
a new `Deflater` instance.

Checksums
---------
This library exports the `adler32` and `crc32` checksum functions. When using
the `deflate` and `inflate` APIs above, checksums are handled automatically,
but if you need to generate or verify checksums for other data you can call
the functions directly.

```js
import { adler32, crc32 } from "@stardazed/zlib";

let a = 1; // initial seed for adler32
let c = 0; // initial seed for crc32
for (const data of my_magical_data_fountain) {
    // data can be an ArrayBuffer or a buffer view (e.g. Uint8Array)
    a = adler32(data, a);
    c = crc32(data, c);
}
```
Keep feeding in the resulting checksum as the seed for the next step to
continue the checksum generation.

Copyright
---------
(c) @zenmumbler: conversion to TypeScript, modularized, modernized,
optimized and extended<br>
Based on zip.js (c) 2013 by Gildas Lormeau: https://gildas-lormeau.github.io/zip.js/<br>
zip.js is based on JZlib 1.0.2 ymnk, JCraft,Inc.<br>
Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler<br>

License
-------
[zlib](https://www.zlib.net/zlib_license.html)
