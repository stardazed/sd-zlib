/*
zlib/defconfig - deflate configurations per level
Part of Stardazed
(c) 2018-Present by Arthur Langereis - @zenmumbler
https://github.com/stardazed/sd-zlib

Based on zip.js (c) 2013 by Gildas Lormeau
Based on zlib (c) 1995-Present Jean-loup Gailly and Mark Adler
*/

export const enum ZFunc {
	STORED = 0,
	FAST = 1,
	SLOW = 2
}

export interface Config {
	good_length: number;
	max_lazy: number;
	nice_length: number;
	max_chain: number;
	func: ZFunc;
}

const makeConfig = (gl: number, ml: number, nl: number, mc: number, func: ZFunc): Config => ({
	good_length: gl,
	max_lazy: ml,
	nice_length: nl,
	max_chain: mc,
	func
});

export const config_table: Config[] = [
/* 0 */	makeConfig(0, 0, 0, 0, ZFunc.STORED),
/* 1 */	makeConfig(4, 4, 8, 4, ZFunc.FAST),
/* 2 */	makeConfig(4, 5, 16, 8, ZFunc.FAST),
/* 3 */	makeConfig(4, 6, 32, 32, ZFunc.FAST),
/* 4 */	makeConfig(4, 4, 16, 16, ZFunc.SLOW),
/* 5 */	makeConfig(8, 16, 32, 32, ZFunc.SLOW),
/* 6 */	makeConfig(8, 16, 128, 128, ZFunc.SLOW),
/* 7 */	makeConfig(8, 32, 128, 256, ZFunc.SLOW),
/* 8 */	makeConfig(32, 128, 258, 1024, ZFunc.SLOW),
/* 9 */	makeConfig(32, 258, 258, 4096, ZFunc.SLOW)
];
