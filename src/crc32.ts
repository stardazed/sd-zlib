/*
zlib/crc32 -- compute the CRC-32 checksum of a buffer
Part of Stardazed
(c) 2018-Present by Arthur Langereis - @zenmumbler
(c) 1995-2006, 2010, 2011, 2012, 2016 Mark Adler
from crc32.c, which can be found at:
https://github.com/madler/zlib/blob/master/crc32.c
*/

import { swap32, u8ArrayFromBufferSource } from "./common";

/**
 * Compute the CRC-32 checksum of a buffer.
 * @param source Source data, a BufferSource
 * @param seed Optional seed for the checksum
 */
export function crc32(source: BufferSource, seed = 0) {
	const view = u8ArrayFromBufferSource(source);
	if (! view) {
		throw new TypeError("source must be a BufferSource");
	}
	return computeCRC32(view, seed);
}

/**
 * This checks for the endian-ness of the current platform.
 * On LE, the byte order will be [1, 0, 0, 0]
 * On BE, the byte order will be [0, 0, 0, 1]
 */
const endian = new Uint32Array([1]);
const endianCheck = new Uint8Array(endian.buffer, 0, 1)[0];

/**
 * Compute the CRC-32 checksum of a sequence of unsigned bytes.
 * @param buf Source data, an Uint8(Clamped)Array
 * @param crc Optional seed for the checksum
 */
const computeCRC32 = (endianCheck === 1) ? computeCRC32Little : computeCRC32Big;


/**
 * Compute the CRC-32 checksum of a sequence of unsigned bytes.
 * This is the implementation of `computeCRC32` for little-endian platforms.
 * @param buf Source data, a buffer of unsigned bytes
 * @param crc Optional seed for the checksum
 * @internal
 */
function computeCRC32Little(buf: Uint8Array, crc = 0) {
	let c = ~crc;
	let offset = buf.byteOffset;
	let position = 0;
	let len = buf.byteLength;

	const table0 = crcTables[0];
	const table1 = crcTables[1];
	const table2 = crcTables[2];
	const table3 = crcTables[3];

	// The ArrayView may be offset to a non-uint32 offset on the
	// underlying buffer, process any initial bytes separately first
	while (len && (offset & 3)) {
		c = table0[(c ^ buf[position++]) & 0xff] ^ (c >>> 8);
		len--;
		offset++;
	}

	// Create a Uint32 view on the (now) aligned offset and limit it to
	// a whole number of Uint32s inside the provided view
	const buf4 = new Uint32Array(buf.buffer, offset, len >>> 2);
	let pos4 = 0;
	while (len >= 32) {
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];

		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		len -= 32;
	}
	while (len >= 4) {
		c ^= buf4[pos4++];
		c = table3[c & 0xff] ^ table2[(c >>> 8) & 0xff] ^ table1[(c >>> 16) & 0xff] ^ table0[c >>> 24];
		len -= 4;
	}

	if (len) {
		position += pos4 * 4; // move the byte pointer to the position after the 4-byte blocks
		do {
			c = table0[(c ^ buf[position++]) & 0xff] ^ (c >>> 8);
		} while (--len);
	}

	c = ~c;
	return c;
}

/**
 * Compute the CRC-32 checksum of a sequence of unsigned bytes.
 * This is the implementation of `computeCRC32` for big-endian platforms.
 * @param buf Source data, a buffer of unsigned bytes
 * @param crc Optional seed for the checksum
 * @internal
 */
function computeCRC32Big(buf: Uint8Array, crc = 0) {
	let c = ~swap32(crc);

	let offset = buf.byteOffset;
	let position = 0;
	let len = buf.byteLength;

	const table4 = crcTables[4];
	const table5 = crcTables[5];
	const table6 = crcTables[6];
	const table7 = crcTables[7];

	// The ArrayView may be offset to a non-uint32 offset on the
	// underlying buffer, process any initial bytes separately first
	while (len && (offset & 3)) {
		c = table4[(c >>> 24) ^ buf[position++]] ^ (c << 8);
		len--;
		offset++;
	}

	const buf4 = new Uint32Array(buf.buffer, offset, len >>> 2);
	let pos4 = 0;
	while (len >= 32) {
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];

		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		len -= 32;
	}
	while (len >= 4) {
		c ^= buf4[pos4++];
		c = table4[c & 0xff] ^ table5[(c >>> 8) & 0xff] ^ table6[(c >>> 16) & 0xff] ^ table7[c >>> 24];
		len -= 4;
	}

	if (len) {
		position += pos4 * 4; // move the byte pointer to the position after the 4-byte blocks
		do {
			c = table4[(c >>> 24) ^ buf[position++]] ^ (c << 8);
		} while (--len);
	}

	c = ~c;
	return swap32(c);
}

/**
 * Precompute a set of tables used for speedy calculation of
 * CRC-32 values for both little and big-endian architectures.
 * @internal
 */
function makeCRCTables() {
	const buf = new ArrayBuffer(256 * 4 * 8);
	const tables = [
		new Uint32Array(buf, 256 * 4 * 0, 256),
		new Uint32Array(buf, 256 * 4 * 1, 256),
		new Uint32Array(buf, 256 * 4 * 2, 256),
		new Uint32Array(buf, 256 * 4 * 3, 256),
		new Uint32Array(buf, 256 * 4 * 4, 256),
		new Uint32Array(buf, 256 * 4 * 5, 256),
		new Uint32Array(buf, 256 * 4 * 6, 256),
		new Uint32Array(buf, 256 * 4 * 7, 256)
	];

	// generate a crc for every 8-bit value
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		tables[0][n] = c;
		tables[4][n] = swap32(c);
	}

	// generate crc for each value followed by one, two, and three zeros,
	// and then the byte reversal of those as well as the first table
	for (let n = 0; n < 256; n++) {
		let c = tables[0][n];
		for (let k = 1; k < 4; k++) {
			c = tables[0][c & 0xff] ^ (c >>> 8);
			tables[k][n] = c;
			tables[k + 4][n] = swap32(c);
		}
	}

	return tables;
}

const crcTables = makeCRCTables();
