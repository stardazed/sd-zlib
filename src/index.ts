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

// tslint:disable:variable-name

import { ZStatus } from "./common";
import { ZStream } from "./zstream";
import { Inflate } from "./inflate";

// Inflater

function Inflater() {
	const inflate = new Inflate();
	const z = new ZStream();
	const bufsize = 16384;
	let nomoreinput = false;

	const append = function(data: Uint8Array) {
		const buffers = [];
		let bufferIndex = 0, bufferSize = 0;
		if (data.length === 0) {
			return;
		}
		z.append(data);

		do {
			z.next_out_index = 0;
			z.avail_out = bufsize;

			if ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it
				z.next_in_index = 0;
				nomoreinput = true;
			}

			const err = inflate.inflate(z);
			if (nomoreinput && (err === ZStatus.BUF_ERROR)) {
				if (z.avail_in !== 0) {
					throw new Error("inflating: bad input");
				}
			} else if (err !== ZStatus.OK && err !== ZStatus.STREAM_END) {
				throw new Error("inflating: " + z.msg);
			}
			if ((nomoreinput || err === ZStatus.STREAM_END) && (z.avail_in === data.length)) {
				throw new Error("inflating: bad input");
			}
			if (z.next_out_index) {
				if (z.next_out_index === bufsize) {
					buffers.push(new Uint8Array(z.next_out));
				}
				else {
					buffers.push(new Uint8Array(z.next_out.subarray(0, z.next_out_index)));
				}
			}
			bufferSize += z.next_out_index;
		} while (z.avail_in > 0 || z.avail_out === 0);

		// concatenate output buffers and return
		const array = new Uint8Array(bufferSize);
		buffers.forEach(function(chunk) {
			array.set(chunk, bufferIndex);
			bufferIndex += chunk.length;
		});
		return array;
	};

	return {
		append
	};
}

export { Inflater };
export * from "./adler32";
export * from "./crc32";
