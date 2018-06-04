/**
 * adler32 -- compute the Adler-32 checksum of a data stream
 * Copyright (C) 1995-2011, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from adler32.c, which can be found at:
 * https://github.com/madler/zlib/blob/v1.2.11/adler32.c
 */

import { TypedArray } from "./common";

const BASE = 65521;     /* largest prime smaller than 65536 */
const NMAX = 5552;

/**
 * Compute the Adler-32 checksum of a source.
 * This method will do its best to get a correct stream of unsigned bytes out
 * of the specified input, but take care when passing in basic arrays.
 * You can use `adler32Bytes` for the "I know what I'm doing" version.
 * @param data Source data, a string, array, TypedArray or ArrayBuffer
 * @param adler Optional seed for the checksum
 */
export function adler32(data: string | number[] | TypedArray | DataView | ArrayBuffer, seed = 1) {
	let buf: ArrayLike<number>;
	if (Array.isArray(data)) {
		buf = data;
	}
	else if (typeof data === "string") {
		// while this will copy the entire string, it is unavoidable for this
		// use case and this function is meant as a quick helper. If you are
		// worried about speed, use (typed) arrays.
		const encoder = new TextEncoder();
		buf = encoder.encode(data);
	}
	else if (data instanceof DataView) {
		buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	else if (data instanceof ArrayBuffer) {
		// create a view on the ArrayBuffer
		buf = new Uint8Array(data);
	}
	else if ((! (data instanceof Uint8Array || data instanceof Uint8ClampedArray))) {
		// create an unsigned byte view over the existing view
		buf = new Uint8Array(data.buffer, data.byteOffset, data.length * data.BYTES_PER_ELEMENT);
	}
	else {
		buf = data;
	}
	return adler32Bytes(buf, seed);
}

/**
 * Compute the Adler-32 checksum of a sequence of unsigned bytes.
 * Make very sure that the individual elements in buf are all
 * in the UNSIGNED byte range (i.e. 0..255) otherwise the
 * result will be indeterminate.
 * @param buf Source data, an array-like of unsigned bytes
 * @param adler Optional seed for the checksum
 */
export function adler32Bytes(buf: ArrayLike<number>, adler = 1) {
	/* split Adler-32 into component sums */
	let sum2 = (adler >>> 16) & 0xffff;
	adler &= 0xffff;

	let len = buf.length;
	let offset = 0;

	/* do length NMAX blocks -- requires just one modulo operation */
	while (len >= NMAX) {
		len -= NMAX;
		let n = NMAX / 16;          /* NMAX is divisible by 16 */
		do {
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
		} while (--n);
		adler %= BASE;
		sum2 += BASE;
	}

	/* do remaining bytes (less than NMAX, still just one modulo) */
	if (len) {                  /* avoid modulos if none remaining */
		while (len >= 16) {
			len -= 16;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;

			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
			adler += buf[offset++]; sum2 += adler;
		}
		while (len--) {
			adler += buf[offset++];
			sum2 += adler;
		}
		adler %= BASE;
		sum2 %= BASE;
	}

	/* return recombined sums */
	return adler | (sum2 << 16);
}


/**
 * Combine 2 Adler32 checksums as if the data yielding adler1
 * and adler2 was concatenated and the total checksum was calculated.
 * @param adler1 Adler32 checksum of buffer 1
 * @param adler2 Adler32 checksum of buffer 2
 * @param len2 The length in bytes of the buffer used to calculate adler2
 */
export function adler32Combine(adler1: number, adler2: number, len2: number) {
	/* for negative len, return invalid adler32 as a clue for debugging */
	if (len2 < 0) {
		return -1;
	}

	/* the derivation of this formula is left as an exercise for the reader */
	const rem = len2 % BASE;
	let sum1 = adler1 & 0xffff;
	let sum2 = rem * sum1;
	sum2 %= BASE;
	sum1 += (adler2 & 0xffff) + BASE - 1;
	sum2 += ((adler1 >>> 16) & 0xffff) + ((adler2 >>> 16) & 0xffff) + BASE - rem;
	if (sum1 >= BASE) { sum1 -= BASE; }
	if (sum1 >= BASE) { sum1 -= BASE; }
	if (sum2 >= (BASE << 1)) { sum2 -= (BASE << 1); }
	if (sum2 >= BASE) { sum2 -= BASE; }
	return sum1 | (sum2 << 16);
}
