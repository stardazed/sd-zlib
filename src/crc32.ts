/**
 * crc32 -- compute the CRC32 checksum of a data stream
 * Copyright (C) 1995-2006, 2010, 2011, 2012, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from crc32.c, which can be found at:
 * https://github.com/madler/zlib/blob/v1.2.11/crc32.c
 */

const swap32 = (q: number) =>
	(((q >>> 24) & 0xff) | ((q >>> 8) & 0xff00) |
	((q & 0xff00) << 8) | ((q & 0xff) << 24)) >>> 0;

function makeCRCTables() {
	const tables: Uint32Array[] = new Array(8).fill(256).map(c => new Uint32Array(c));

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


export function crc32Simple(buf: ArrayLike<number>, crc = 0) {
	let len = buf.length;
	let position = 0;
	const table = crcTables[0];

	crc = ~crc;
	while (len >= 8) {
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);

		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);

		len -= 8;
	}
	if (len) {
		do {
			crc = table[(crc ^ buf[position++]) & 0xff] ^ (crc >>> 8);
		} while (--len);
	}
	return ~crc;
}


/* =========================================================================
#define DOLIT4 c ^= *buf4++; \
				c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ \
						crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24]
#define DOLIT32 DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4

========================================================================= */
export function crc32BytesLittle(buf: Uint8Array | Uint8ClampedArray, crc = 0) {
	let c = ~crc >>> 0;
	let offset = buf.byteOffset;
	let position = 0;
	let len = buf.byteLength;

	// The ArrayView may be offset to a non-uint32 offset on the
	// underlying buffer, process any initial bytes separately first
	while (len && (offset & 3)) {
		c = crcTables[0][(c ^ buf[position++]) & 0xff] ^ (c >>> 8);
		len--;
		offset++;
	}

	// Create a Uint32 view on the (now) aligned offset and limit it to
	// a whole number of Uint32s inside the provided view
	const buf4 = new Uint32Array(buf.buffer, offset, len >>> 2);
	let pos4 = 0;
	while (len >= 32) {
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];

		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		len -= 32;
	}
	while (len >= 4) {
		c ^= buf4[pos4++];
		c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24];
		len -= 4;
	}

	if (len) {
		position += pos4 * 4; // move the byte pointer to the position after the 4-byte blocks
		do {
			c = crcTables[0][(c ^ buf[position++]) & 0xff] ^ (c >>> 8);
		} while (--len);
	}

	c = ~c >>> 0;
	return swap32(c);
}


/* =========================================================================
#define DOBIG4 c ^= *buf4++; \
				c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ \
						crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24]
#define DOBIG32 DOBIG4; DOBIG4; DOBIG4; DOBIG4; DOBIG4; DOBIG4; DOBIG4; DOBIG4

========================================================================= */
export function crc32BytesBig(buf: Uint8Array | Uint8ClampedArray, crc = 0) {
	let c = (~swap32(crc)) >>> 0;

	let offset = buf.byteOffset;
	let position = 0;
	let len = buf.byteLength;

	// The ArrayView may be offset to a non-uint32 offset on the
	// underlying buffer, process any initial bytes separately first
	while (len && (offset & 3)) {
		c = crcTables[4][(c >>> 24) ^ buf[position++]] ^ (c << 8);
		len--;
		offset++;
	}

	const buf4 = new Uint32Array(buf.buffer, offset, len >>> 2);
	let pos4 = 0;
	while (len >= 32) {
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];

		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		len -= 32;
	}
	while (len >= 4) {
		c ^= buf4[pos4++];
		c = crcTables[4][c & 0xff] ^ crcTables[5][(c >>> 8) & 0xff] ^ crcTables[6][(c >>> 16) & 0xff] ^ crcTables[7][c >>> 24];
		len -= 4;
	}

	if (len) {
		position += pos4 * 4; // move the byte pointer to the position after the 4-byte blocks
		do {
			c = crcTables[4][(c >>> 24) ^ buf[position++]] ^ (c << 8);
		} while (--len);
	}

	c = ~c;
	return swap32(c);
}
