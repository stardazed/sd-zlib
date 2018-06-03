// @ts-check
import resolve from "rollup-plugin-node-resolve";
import typescript from "typescript";
import tsc from "rollup-plugin-typescript2";

export default [
	{
		input: "src/index.ts",
		output: [
			{
				file: "dist/index.esm.js",
				format: "es",
				sourcemap: false,
				freeze: false
			},
			{
				file: "dist/index.umd.js",
				name: "sdInflate",
				format: "umd",
				sourcemap: false,
				freeze: false
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
