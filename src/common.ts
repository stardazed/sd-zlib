// Common constants and tables
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name

import { ZStream } from "./zstream";

export type TypedArray = Uint8Array | Uint8ClampedArray | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;

export const enum ZStatus {
	OK = 0,
	STREAM_END = 1,
	NEED_DICT = 2,
	STREAM_ERROR = -2,
	DATA_ERROR = -3,
	MEM_ERROR = -4,
	BUF_ERROR = -5,
}

export const enum ZLimits {
	MIN_BITS = 8,
	MAX_BITS = 15,
	MANY = 1400
}

export const inflate_mask = [
	0x00000000, 0x00000001, 0x00000003, 0x00000007,
	0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f,
	0x000000ff, 0x000001ff, 0x000003ff, 0x000007ff,
	0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff,
	0x0000ffff
];


export type InOut<T> = [T];

export type NumArray = Int32Array | number[];

export interface ZBuffer {
	bitk: number; // bits in bit buffer
	bitb: number; // bit buffer
	window: Uint8Array; // sliding window
	end: number; // one byte after sliding window
	read: number; // window read pointer
	write: number; // window write pointer

	inflate_flush(z: ZStream, r: ZStatus): ZStatus;
}

export const swap32 = (q: number) =>
	(((q >>> 24) & 0xff) | ((q >>> 8) & 0xff00) |
	((q & 0xff00) << 8) | ((q & 0xff) << 24)) >>> 0;
