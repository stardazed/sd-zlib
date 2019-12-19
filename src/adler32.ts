/**
 * zip/adler32 -- compute the Adler-32 checksum of a data stream
 * Copyright (C) 1995-2011, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from adler32.c, which can be found at:
 * https://github.com/madler/zlib/blob/master/adler32.c
 */

/**
 * Compute the Adler-32 checksum of the data in a buffer or buffer view.
 * @param data Source data, a BufferSource
 * @param seed Optional seed for the checksum
 */
export function adler32(source: BufferSource, seed = 1) {
	if (source instanceof ArrayBuffer) {
		source = new Uint8Array(source);
	}
	else if (! ArrayBuffer.isView(source)) {
		throw new TypeError("source must be an ArrayBuffer, a TypedArray or a DataView");
	}
	else if (! (source instanceof Uint8Array)) {
		// ensure we look at one byte at a time
		source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
	}

	return computeAdler32(source as Uint8Array, seed);
}

const BASE = 65521;     /* largest prime smaller than 65536 */
const NMAX = 5552;

/**
 * Compute the Adler-32 checksum of a sequence of unsigned bytes.
 * @param buf source data, unsigned bytes
 * @param adler Optional seed for the checksum
 */
function computeAdler32(buf: Uint8Array, adler = 1) {
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
