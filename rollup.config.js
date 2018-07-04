// @ts-check
import resolve from "rollup-plugin-node-resolve";
import typescript from "typescript";
import tsc from "rollup-plugin-typescript2";

const banner = `/**
 * @stardazed/inflate - zip inflate algorithm implementation
 * Part of Stardazed
 * (c) 2018 by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/sd-inflate
 *
 * inflate.js (c) 2013 by Gildas Lormeau, part of the zip.js library
 * Based on zlib (c) 1995-2017 Jean-loup Gailly and Mark Adler
 */`;

export default [
	{
		input: "src/sd-inflate.ts",
		output: [
			{
				file: "dist/sd-inflate.esm.js",
				format: "es",
				sourcemap: false,
				intro: banner
			},
			{
				name: "sdInflate",
				file: "dist/sd-inflate.umd.js",
				format: "umd",
				sourcemap: false,
				intro: banner
			}
		],
		plugins: [
			resolve({ browser: true }),
			tsc({
				typescript,
				cacheRoot: "./build",
				include: ["src/**/*.ts"],
			}),
		]
	}
];
