// @ts-check
import resolve from "@rollup/plugin-node-resolve";
import tsc from "rollup-plugin-typescript2";
import typescript from "typescript";

const banner = `/*
@stardazed/zlib - Zlib library implementation
Part of Stardazed
(c) 2018-Present by @zenmumbler
https://github.com/stardazed/sd-zlib

Based on zip.js (c) 2013 by Gildas Lormeau
Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
*/`;

export default [
	{
		input: "src/sd-zlib.ts",
		output: [
			{
				file: "dist/sd-zlib.js",
				format: "es",
				sourcemap: false,
				intro: banner
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
