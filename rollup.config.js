// @ts-check
import resolve from "@rollup/plugin-node-resolve";
import tsc from "rollup-plugin-typescript2";
import typescript from "typescript";

const banner = `/**
 * @stardazed/zip - zip algorithm implementation
 * Part of Stardazed
 * (c) 2018-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-zip
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
 */`;

export default [
	{
		input: "src/sd-zip.ts",
		output: [
			{
				file: "dist/sd-zip.esm.js",
				format: "es",
				sourcemap: false,
				intro: banner
			},
			{
				name: "sdInflate",
				file: "dist/sd-zip.umd.js",
				format: "umd",
				sourcemap: false,
				intro: banner,
				globals: {
					"@stardazed/adler32": "sdAdler32"
				}
			}
		],
		plugins: [
			resolve({ browser: true }),
			tsc({
				typescript
			}),
		],
		external(id) {
			return id.includes("@stardazed/");
		}
	}
];
