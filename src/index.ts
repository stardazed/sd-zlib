/**
 * Copyright (c) 2013 Gildas Lormeau. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright 
 * notice, this list of conditions and the following disclaimer in 
 * the documentation and/or other materials provided with the distribution.
 *
 * 3. The names of the authors may not be used to endorse or promote products
 * derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 * INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 *
 * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.
 * JZlib is based on zlib-1.1.3, so all credit should go authors
 * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)
 * and contributors of zlib.
 *
 *
 * Modifications by Arthur Langereis (@zenmumbler):
 * - Increased output buffer size from 512 bytes to 16384 bytes
 * - Replace ZStream.read_byte calls with direct z.next_in[] accesses
 * - Removed onprogress callback
 * - Removed usages of .subarray and .set in the inner loops, increasing performance by ~3x
 * - Converted to TypeScript
 * - Modularized
 * - Use const enums for enum-likes
 * - Modernize code as much as reasonably possible, removing unused features
 */

import { ZStatus } from "./common";
import { ZStream, OUTPUT_BUFSIZE } from "./zstream";
import { Inflate } from "./inflate";

export interface InflaterOptions {
	/**
	 * If set, the DEFLATE header and optional preset dictionary
	 * checksum will be parsed and verified.
	 * Set to false if you only have the compressed data, e.g.
	 * of a gzip file.
	 * @default true
	 */
	dataIncludesHeader: boolean;

	/**
	 * If set to true, then you can call {{finish}} mid-stream.
	 * This is only useful if you know you have incomplete data.
	 * @default false
	 */
	allowPartialData: boolean;

	/**
	 * Provide an optional precalculated lookup dictionary.
	 * Only used if the data indicates it needs an external dictionary.
	 * If used, the Adler32 checksum of the dictionary is verified
	 * against the checksum stored in the deflated data.
	 * If {{dataIncludesHeader}} is false, then this is ignored.
	 * @default undefined
	 */
	presetDictionary: Uint8Array | Uint8ClampedArray;
}

export class Inflater {
	private inflate: Inflate;
	private z: ZStream;
	private customDict: Uint8Array | Uint8ClampedArray | undefined;
	private allowPartialData: boolean;
	private buffers: Uint8Array[];

	constructor(options?: Partial<InflaterOptions>) {
		options = options || {};
		const parseHeader = options.dataIncludesHeader === undefined ? true : options.dataIncludesHeader;
		this.allowPartialData = options.allowPartialData === undefined ? false : options.allowPartialData;

		this.inflate = new Inflate(parseHeader);
		this.z = new ZStream();
		this.customDict = options.presetDictionary;
		this.buffers = [];
	}

	/**
	 * Add more data to be decompressed. Call this as many times as
	 * needed as deflated data becomes available.
	 * @param data A Uint8 view of the compressed data.
	 * @throws {Error} Will throw in case of bad data
	 */
	append(data: Uint8Array | Uint8ClampedArray) {
		if (data.length === 0) {
			return;
		}
		const { inflate, z, buffers } = this;
		let nomoreinput = false;
		z.append(data);

		do {
			z.next_out_index = 0;
			z.avail_out = OUTPUT_BUFSIZE;

			if ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it
				z.next_in_index = 0;
				nomoreinput = true;
			}

			const err = inflate.inflate(z);
			if (nomoreinput && (err === ZStatus.BUF_ERROR)) {
				if (z.avail_in !== 0) {
					throw new Error("inflating: bad input");
				}
			}
			else if (err === ZStatus.NEED_DICT) {
				if (this.customDict) {
					const dictErr = inflate.inflateSetDictionary(this.customDict);
					if (dictErr !== ZStatus.OK) {
						throw new Error("Custom dictionary is invalid for this data");
					}
				}
				else {
					throw new Error("Custom dictionary required");
				}
			}
			else if (err !== ZStatus.OK && err !== ZStatus.STREAM_END) {
				throw new Error("inflating: " + z.msg);
			}
			if ((nomoreinput || err === ZStatus.STREAM_END) && (z.avail_in === data.length)) {
				throw new Error("inflating: bad input");
			}
			if (z.next_out_index) {
				if (z.next_out_index === OUTPUT_BUFSIZE) {
					buffers.push(new Uint8Array(z.next_out));
				}
				else {
					buffers.push(new Uint8Array(z.next_out.subarray(0, z.next_out_index)));
				}
			}
		} while (z.avail_in > 0 || z.avail_out === 0);
	}

	private mergeBuffers(buffers: Uint8Array[]) {
		const totalSize = buffers.map(b => b.byteLength).reduce((s, l) => s + l, 0);
		const output = new Uint8Array(totalSize);

		let offset = 0;
		for (const buf of buffers) {
			output.set(buf, offset);
			offset += buf.length;
		}
		return output;
	}

	/**
	 * Complete the inflate action and return the resulting
	 * data.
	 * @throws {Error} If the data is incomplete and you did
	 * not set allowPartialData in the constructor.
	 */
	finish() {
		if (! this.inflate.isComplete && ! this.allowPartialData) {
			throw new Error("Cannot finish inflating incomplete data.");
		}

		return this.mergeBuffers(this.buffers);
	}
}

