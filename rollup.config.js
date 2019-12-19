// @ts-check
import resolve from "@rollup/plugin-node-resolve";
import tsc from "rollup-plugin-typescript2";
import typescript from "typescript";

const banner = `/**
 * @stardazed/gzip - GZip library implementation
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-gzip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
 */`;

export default [
	{
		input: "src/sd-gzip.ts",
		output: [
			{
				file: "dist/sd-gzip.esm.js",
				format: "es",
				sourcemap: false,
				intro: banner
			},
			{
				name: "sdGZip",
				file: "dist/sd-gzip.umd.js",
				format: "umd",
				sourcemap: false,
				intro: banner,
			}
		],
		plugins: [
			resolve({ browser: true }),
			tsc({
				typescript
			}),
		]
	}
];
