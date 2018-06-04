// ZStream
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name
class ZStream {
    constructor() {
        this.avail_in = 0;
        this.next_in_index = 0;
        this.next_out = new Uint8Array(16384 /* OUTPUT_BUFSIZE */);
        this.avail_out = this.next_out.byteLength;
        this.next_out_index = 0;
        this.total_in = this.total_out = 0;
        this.msg = "";
    }
    append(data) {
        this.next_in = data;
        this.avail_in = data.length;
        this.next_in_index = 0;
    }
    read_buf(start, size) {
        return this.next_in.subarray(start, start + size);
    }
}

// Common constants and tables
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name
const inflate_mask = [
    0x00000000, 0x00000001, 0x00000003, 0x00000007,
    0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f,
    0x000000ff, 0x000001ff, 0x000003ff, 0x000007ff,
    0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff,
    0x0000ffff
];

// InfCodes
function InfCodes() {
    let mode; // current inflate_codes mode
    // mode dependent information
    let len = 0;
    let tree; // pointer into tree
    let tree_index = 0;
    let need = 0; // bits needed
    let lit = 0;
    // if EXT or Mode.COPY, where and how much
    let get = 0; // bits to get for extra
    let dist = 0; // distance back to copy from
    let lbits = 0; // ltree bits decoded per branch
    let dbits = 0; // dtree bits decoder per branch
    let ltree; // literal/length/eob tree
    let ltree_index = 0; // literal/length/eob tree
    let dtree; // distance tree
    let dtree_index = 0; // distance tree
    // Called with number of bytes left to write in window at least 258
    // (the maximum string length) and number of input bytes available
    // at least ten. The ten bytes are six bytes for the longest length/
    // distance pair plus four bytes for overloading the bit buffer.
    function inflate_fast(bl, bd, tl, tl_index, td, td_index, s, z) {
        let t; // temporary pointer
        let tp; // temporary pointer
        let tp_index; // temporary pointer
        let e; // extra bits or operation
        let b; // bit buffer
        let k; // bits in bit buffer
        let p; // input data pointer
        let n; // bytes available there
        let q; // output window write pointer
        let m; // bytes to end of window or read pointer
        let ml; // mask for literal/length tree
        let md; // mask for distance tree
        let c; // bytes to copy
        let d; // distance back to copy from
        let r; // copy source pointer
        let tp_index_t_3; // (tp_index+t)*3
        // load input, output, bit values
        p = z.next_in_index;
        n = z.avail_in;
        b = s.bitb;
        k = s.bitk;
        q = s.write;
        m = q < s.read ? s.read - q - 1 : s.end - q;
        // initialize masks
        ml = inflate_mask[bl];
        md = inflate_mask[bd];
        // do until not enough input or output space for fast loop
        do { // assume called with m >= 258 && n >= 10
            // get literal/length code
            while (k < (20)) { // max bits for literal/length code
                n--;
                b |= (z.next_in[p++] & 0xff) << k;
                k += 8;
            }
            t = b & ml;
            tp = tl;
            tp_index = tl_index;
            tp_index_t_3 = (tp_index + t) * 3;
            e = tp[tp_index_t_3];
            if (e === 0) {
                b >>= (tp[tp_index_t_3 + 1]);
                k -= (tp[tp_index_t_3 + 1]);
                s.window[q++] = /* (byte) */ tp[tp_index_t_3 + 2];
                m--;
                continue;
            }
            do {
                b >>= (tp[tp_index_t_3 + 1]);
                k -= (tp[tp_index_t_3 + 1]);
                if ((e & 16) !== 0) {
                    e &= 15;
                    c = tp[tp_index_t_3 + 2] + ( /* (int) */b & inflate_mask[e]);
                    b >>= e;
                    k -= e;
                    // decode distance base of block to copy
                    while (k < (15)) { // max bits for distance code
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    t = b & md;
                    tp = td;
                    tp_index = td_index;
                    tp_index_t_3 = (tp_index + t) * 3;
                    e = tp[tp_index_t_3];
                    do {
                        b >>= (tp[tp_index_t_3 + 1]);
                        k -= (tp[tp_index_t_3 + 1]);
                        if ((e & 16) !== 0) {
                            // get extra bits to add to distance base
                            e &= 15;
                            while (k < (e)) { // get extra bits (up to 13)
                                n--;
                                b |= (z.next_in[p++] & 0xff) << k;
                                k += 8;
                            }
                            d = tp[tp_index_t_3 + 2] + (b & inflate_mask[e]);
                            b >>= (e);
                            k -= (e);
                            // do the copy
                            m -= c;
                            if (q >= d) { // offset before dest
                                // just copy
                                r = q - d;
                                // if (q - r > 0 && 2 > (q - r)) {
                                s.window[q++] = s.window[r++]; // minimum count is three,
                                s.window[q++] = s.window[r++]; // so unroll loop a little
                                c -= 2;
                                // } else {
                                // 	s.window.set(s.window.subarray(r, r + 2), q);
                                // 	q += 2;
                                // 	r += 2;
                                // 	c -= 2;
                                // }
                            }
                            else { // else offset after destination
                                r = q - d;
                                do {
                                    r += s.end; // force pointer in window
                                } while (r < 0); // covers invalid distances
                                e = s.end - r;
                                if (c > e) { // if source crosses,
                                    c -= e; // wrapped copy
                                    // if (q - r > 0 && e > (q - r)) {
                                    do {
                                        s.window[q++] = s.window[r++];
                                    } while (--e !== 0);
                                    // } else {
                                    // 	s.window.set(s.window.subarray(r, r + e), q);
                                    // 	q += e;
                                    // 	r += e;
                                    // 	e = 0;
                                    // }
                                    r = 0; // copy rest from start of window
                                }
                            }
                            // copy all or what's left
                            // if (q - r > 0 && c > (q - r)) {
                            do {
                                s.window[q++] = s.window[r++];
                            } while (--c !== 0);
                            // } else {
                            // 	s.window.set(s.window.subarray(r, r + c), q);
                            // 	q += c;
                            // 	r += c;
                            // 	c = 0;
                            // }
                            break;
                        }
                        else if ((e & 64) === 0) {
                            t += tp[tp_index_t_3 + 2];
                            t += (b & inflate_mask[e]);
                            tp_index_t_3 = (tp_index + t) * 3;
                            e = tp[tp_index_t_3];
                        }
                        else {
                            z.msg = "invalid distance code";
                            c = z.avail_in - n;
                            c = (k >> 3) < c ? k >> 3 : c;
                            n += c;
                            p -= c;
                            k -= c << 3;
                            s.bitb = b;
                            s.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            s.write = q;
                            return -3 /* DATA_ERROR */;
                        }
                    } while (true);
                    break;
                }
                if ((e & 64) === 0) {
                    t += tp[tp_index_t_3 + 2];
                    t += (b & inflate_mask[e]);
                    tp_index_t_3 = (tp_index + t) * 3;
                    e = tp[tp_index_t_3];
                    if (e === 0) {
                        b >>= (tp[tp_index_t_3 + 1]);
                        k -= (tp[tp_index_t_3 + 1]);
                        s.window[q++] = /* (byte) */ tp[tp_index_t_3 + 2];
                        m--;
                        break;
                    }
                }
                else if ((e & 32) !== 0) {
                    c = z.avail_in - n;
                    c = (k >> 3) < c ? k >> 3 : c;
                    n += c;
                    p -= c;
                    k -= c << 3;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return 1 /* STREAM_END */;
                }
                else {
                    z.msg = "invalid literal/length code";
                    c = z.avail_in - n;
                    c = (k >> 3) < c ? k >> 3 : c;
                    n += c;
                    p -= c;
                    k -= c << 3;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return -3 /* DATA_ERROR */;
                }
            } while (true);
        } while (m >= 258 && n >= 10);
        // not enough input or output--restore pointers and return
        c = z.avail_in - n;
        c = (k >> 3) < c ? k >> 3 : c;
        n += c;
        p -= c;
        k -= c << 3;
        s.bitb = b;
        s.bitk = k;
        z.avail_in = n;
        z.total_in += p - z.next_in_index;
        z.next_in_index = p;
        s.write = q;
        return 0 /* OK */;
    }
    function init(bl, bd, tl, tl_index, td, td_index) {
        mode = 0 /* START */;
        lbits = /* (byte) */ bl;
        dbits = /* (byte) */ bd;
        ltree = tl;
        ltree_index = tl_index;
        dtree = td;
        dtree_index = td_index;
        // tree = null;
    }
    function proc(s, z, r) {
        let j; // temporary storage
        let tindex; // temporary pointer
        let e; // extra bits or operation
        let b = 0; // bit buffer
        let k = 0; // bits in bit buffer
        let p = 0; // input data pointer
        let n; // bytes available there
        let q; // output window write pointer
        let m; // bytes to end of window or read pointer
        let f; // pointer to copy strings from
        // copy input/output information to locals (UPDATE macro restores)
        p = z.next_in_index;
        n = z.avail_in;
        b = s.bitb;
        k = s.bitk;
        q = s.write;
        m = q < s.read ? s.read - q - 1 : s.end - q;
        // process input and output based on current state
        while (true) {
            switch (mode) {
                // waiting for "i:"=input, "o:"=output, "x:"=nothing
                case 0 /* START */: // x: set up for Mode.LEN
                    if (m >= 258 && n >= 10) {
                        s.bitb = b;
                        s.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        s.write = q;
                        r = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s, z);
                        p = z.next_in_index;
                        n = z.avail_in;
                        b = s.bitb;
                        k = s.bitk;
                        q = s.write;
                        m = q < s.read ? s.read - q - 1 : s.end - q;
                        if (r !== 0 /* OK */) {
                            mode = r === 1 /* STREAM_END */ ? 7 /* WASH */ : 9 /* BADCODE */;
                            break;
                        }
                    }
                    need = lbits;
                    tree = ltree;
                    tree_index = ltree_index;
                    mode = 1 /* LEN */;
                /* falls through */
                case 1 /* LEN */: // i: get length/literal/eob next
                    j = need;
                    while (k < (j)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            s.bitb = b;
                            s.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            s.write = q;
                            return s.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    tindex = (tree_index + (b & inflate_mask[j])) * 3;
                    b >>>= (tree[tindex + 1]);
                    k -= (tree[tindex + 1]);
                    e = tree[tindex];
                    if (e === 0) { // literal
                        lit = tree[tindex + 2];
                        mode = 6 /* LIT */;
                        break;
                    }
                    if ((e & 16) !== 0) { // length
                        get = e & 15;
                        len = tree[tindex + 2];
                        mode = 2 /* LENEXT */;
                        break;
                    }
                    if ((e & 64) === 0) { // next table
                        need = e;
                        tree_index = tindex / 3 + tree[tindex + 2];
                        break;
                    }
                    if ((e & 32) !== 0) { // end of block
                        mode = 7 /* WASH */;
                        break;
                    }
                    mode = 9 /* BADCODE */; // invalid code
                    z.msg = "invalid literal/length code";
                    r = -3 /* DATA_ERROR */;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return s.inflate_flush(z, r);
                case 2 /* LENEXT */: // i: getting length extra (have base)
                    j = get;
                    while (k < (j)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            s.bitb = b;
                            s.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            s.write = q;
                            return s.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    len += (b & inflate_mask[j]);
                    b >>= j;
                    k -= j;
                    need = dbits;
                    tree = dtree;
                    tree_index = dtree_index;
                    mode = 3 /* DIST */;
                /* falls through */
                case 3 /* DIST */: // i: get distance next
                    j = need;
                    while (k < (j)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            s.bitb = b;
                            s.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            s.write = q;
                            return s.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    tindex = (tree_index + (b & inflate_mask[j])) * 3;
                    b >>= tree[tindex + 1];
                    k -= tree[tindex + 1];
                    e = (tree[tindex]);
                    if ((e & 16) !== 0) { // distance
                        get = e & 15;
                        dist = tree[tindex + 2];
                        mode = 4 /* DISTEXT */;
                        break;
                    }
                    if ((e & 64) === 0) { // next table
                        need = e;
                        tree_index = tindex / 3 + tree[tindex + 2];
                        break;
                    }
                    mode = 9 /* BADCODE */; // invalid code
                    z.msg = "invalid distance code";
                    r = -3 /* DATA_ERROR */;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return s.inflate_flush(z, r);
                case 4 /* DISTEXT */: // i: getting distance extra
                    j = get;
                    while (k < (j)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            s.bitb = b;
                            s.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            s.write = q;
                            return s.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    dist += (b & inflate_mask[j]);
                    b >>= j;
                    k -= j;
                    mode = 5 /* COPY */;
                /* falls through */
                case 5 /* COPY */: // o: copying bytes in window, waiting for space
                    f = q - dist;
                    while (f < 0) { // modulo window size-"while" instead
                        f += s.end; // of "if" handles invalid distances
                    }
                    while (len !== 0) {
                        if (m === 0) {
                            if (q === s.end && s.read !== 0) {
                                q = 0;
                                m = q < s.read ? s.read - q - 1 : s.end - q;
                            }
                            if (m === 0) {
                                s.write = q;
                                r = s.inflate_flush(z, r);
                                q = s.write;
                                m = q < s.read ? s.read - q - 1 : s.end - q;
                                if (q === s.end && s.read !== 0) {
                                    q = 0;
                                    m = q < s.read ? s.read - q - 1 : s.end - q;
                                }
                                if (m === 0) {
                                    s.bitb = b;
                                    s.bitk = k;
                                    z.avail_in = n;
                                    z.total_in += p - z.next_in_index;
                                    z.next_in_index = p;
                                    s.write = q;
                                    return s.inflate_flush(z, r);
                                }
                            }
                        }
                        s.window[q++] = s.window[f++];
                        m--;
                        if (f === s.end) {
                            f = 0;
                        }
                        len--;
                    }
                    mode = 0 /* START */;
                    break;
                case 6 /* LIT */: // o: got literal, waiting for output space
                    if (m === 0) {
                        if (q === s.end && s.read !== 0) {
                            q = 0;
                            m = q < s.read ? s.read - q - 1 : s.end - q;
                        }
                        if (m === 0) {
                            s.write = q;
                            r = s.inflate_flush(z, r);
                            q = s.write;
                            m = q < s.read ? s.read - q - 1 : s.end - q;
                            if (q === s.end && s.read !== 0) {
                                q = 0;
                                m = q < s.read ? s.read - q - 1 : s.end - q;
                            }
                            if (m === 0) {
                                s.bitb = b;
                                s.bitk = k;
                                z.avail_in = n;
                                z.total_in += p - z.next_in_index;
                                z.next_in_index = p;
                                s.write = q;
                                return s.inflate_flush(z, r);
                            }
                        }
                    }
                    r = 0 /* OK */;
                    s.window[q++] = /* (byte) */ lit;
                    m--;
                    mode = 0 /* START */;
                    break;
                case 7 /* WASH */: // o: got eob, possibly more output
                    if (k > 7) { // return unused byte, if any
                        k -= 8;
                        n++;
                        p--; // can always return one
                    }
                    s.write = q;
                    r = s.inflate_flush(z, r);
                    q = s.write;
                    m = q < s.read ? s.read - q - 1 : s.end - q;
                    if (s.read !== s.write) {
                        s.bitb = b;
                        s.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        s.write = q;
                        return s.inflate_flush(z, r);
                    }
                    mode = 8 /* END */;
                /* falls through */
                case 8 /* END */:
                    r = 1 /* STREAM_END */;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return s.inflate_flush(z, r);
                case 9 /* BADCODE */: // x: got error
                    r = -3 /* DATA_ERROR */;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return s.inflate_flush(z, r);
                default:
                    r = -2 /* STREAM_ERROR */;
                    s.bitb = b;
                    s.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    s.write = q;
                    return s.inflate_flush(z, r);
            }
        }
    }
    return {
        init, proc
    };
}

// InfTree
// Part of sd-inflate -- see index for copyright and info
// tslint:disable:variable-name
const fixed_bl = 9;
const fixed_bd = 5;
const fixed_tl = [
    96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9, 192, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 160, 0, 8, 0,
    0, 8, 128, 0, 8, 64, 0, 9, 224, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 144, 83, 7, 59, 0, 8, 120, 0, 8, 56, 0, 9, 208, 81, 7, 17, 0, 8, 104, 0, 8, 40,
    0, 9, 176, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 240, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8, 227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 200, 81, 7, 13,
    0, 8, 100, 0, 8, 36, 0, 9, 168, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 232, 80, 7, 8, 0, 8, 92, 0, 8, 28, 0, 9, 152, 84, 7, 83, 0, 8, 124, 0, 8, 60,
    0, 9, 216, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 184, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9, 248, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7,
    35, 0, 8, 114, 0, 8, 50, 0, 9, 196, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 164, 0, 8, 2, 0, 8, 130, 0, 8, 66, 0, 9, 228, 80, 7, 7, 0, 8, 90, 0, 8,
    26, 0, 9, 148, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 212, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9, 180, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 244, 80,
    7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 204, 81, 7, 15, 0, 8, 102, 0, 8, 38, 0, 9, 172, 0, 8, 6, 0, 8, 134, 0,
    8, 70, 0, 9, 236, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 156, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9, 220, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 188, 0,
    8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 252, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0, 8, 113, 0, 8, 49, 0, 9, 194, 80, 7, 10, 0, 8, 97,
    0, 8, 33, 0, 9, 162, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 226, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9, 146, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 210,
    81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 178, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 242, 80, 7, 4, 0, 8, 85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117,
    0, 8, 53, 0, 9, 202, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 170, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9, 234, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 154,
    84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 218, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 186, 0, 8, 13, 0, 8, 141, 0, 8, 77, 0, 9, 250, 80, 7, 3, 0, 8, 83,
    0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 198, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9, 166, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 230,
    80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 150, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 214, 82, 7, 19, 0, 8, 107, 0, 8, 43, 0, 9, 182, 0, 8, 11, 0, 8, 139,
    0, 8, 75, 0, 9, 246, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9, 206, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 174,
    0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 238, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 158, 84, 7, 99, 0, 8, 127, 0, 8, 63, 0, 9, 222, 82, 7, 27, 0, 8, 111,
    0, 8, 47, 0, 9, 190, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 254, 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9,
    193, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 161, 0, 8, 0, 0, 8, 128, 0, 8, 64, 0, 9, 225, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 145, 83, 7, 59, 0, 8,
    120, 0, 8, 56, 0, 9, 209, 81, 7, 17, 0, 8, 104, 0, 8, 40, 0, 9, 177, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 241, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8,
    227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 201, 81, 7, 13, 0, 8, 100, 0, 8, 36, 0, 9, 169, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 233, 80, 7, 8, 0, 8,
    92, 0, 8, 28, 0, 9, 153, 84, 7, 83, 0, 8, 124, 0, 8, 60, 0, 9, 217, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 185, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9,
    249, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7, 35, 0, 8, 114, 0, 8, 50, 0, 9, 197, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 165, 0, 8, 2, 0, 8,
    130, 0, 8, 66, 0, 9, 229, 80, 7, 7, 0, 8, 90, 0, 8, 26, 0, 9, 149, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 213, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9,
    181, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 245, 80, 7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 205, 81, 7, 15, 0, 8,
    102, 0, 8, 38, 0, 9, 173, 0, 8, 6, 0, 8, 134, 0, 8, 70, 0, 9, 237, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 157, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9,
    221, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 189, 0, 8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 253, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0,
    8, 113, 0, 8, 49, 0, 9, 195, 80, 7, 10, 0, 8, 97, 0, 8, 33, 0, 9, 163, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 227, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9,
    147, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 211, 81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 179, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 243, 80, 7, 4, 0, 8,
    85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117, 0, 8, 53, 0, 9, 203, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 171, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9,
    235, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 155, 84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 219, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 187, 0, 8, 13, 0, 8,
    141, 0, 8, 77, 0, 9, 251, 80, 7, 3, 0, 8, 83, 0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 199, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9,
    167, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 231, 80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 151, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 215, 82, 7, 19, 0, 8,
    107, 0, 8, 43, 0, 9, 183, 0, 8, 11, 0, 8, 139, 0, 8, 75, 0, 9, 247, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9,
    207, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 175, 0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 239, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 159, 84, 7, 99, 0, 8,
    127, 0, 8, 63, 0, 9, 223, 82, 7, 27, 0, 8, 111, 0, 8, 47, 0, 9, 191, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 255
];
const fixed_td = [
    80, 5, 1, 87, 5, 257, 83, 5, 17, 91, 5, 4097, 81, 5, 5, 89, 5, 1025, 85, 5, 65, 93, 5, 16385, 80, 5, 3, 88, 5, 513, 84, 5, 33, 92, 5,
    8193, 82, 5, 9, 90, 5, 2049, 86, 5, 129, 192, 5, 24577, 80, 5, 2, 87, 5, 385, 83, 5, 25, 91, 5, 6145, 81, 5, 7, 89, 5, 1537, 85, 5, 97, 93, 5,
    24577, 80, 5, 4, 88, 5, 769, 84, 5, 49, 92, 5, 12289, 82, 5, 13, 90, 5, 3073, 86, 5, 193, 192, 5, 24577
];
// Tables for deflate from PKZIP's appnote.txt.
const cplens = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0
];
// see note #13 above about 258
const cplext = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 112, 112 // 112==invalid
];
const cpdist = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const cpdext = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
// If BMAX needs to be larger than 16, then h and x[] should be uLong.
const BMAX = 15; // maximum bit length of any code
let v; // work area for huft_build
const hn = [0]; // hufts used in space
const c = new Int32Array(BMAX + 1); // bit length count table
const r = new Int32Array(3); // table entry for structure assignment
const u = new Int32Array(BMAX); // table stack
const x = new Int32Array(BMAX + 1); // bit offsets, then code stack
function huft_build(b, // code lengths in bits (all assumed <= BMAX)
bindex, n, // number of codes (assumed <= 288)
s, // number of simple-valued codes (0..s-1)
d, // list of base values for non-simple codes
e, // list of extra bits for non-simple codes
t, // result: starting table
m, // maximum lookup bits, returns actual
hp, // space for trees
hn, // hufts used in space
v // working area: values in order of bit length
) {
    // Given a list of code lengths and a maximum table size, make a set of
    // tables to decode that set of codes. Return ZStatus.OK on success,
    // ZStatus.BUF_ERROR if the given code set is incomplete (the tables are still built in
    // this case), ZStatus.DATA_ERROR if the input is invalid (an over-subscribed set
    // of lengths), or ZStatus.MEM_ERROR if not enough memory.
    let a; // counter for codes of length k
    let f; // i repeats in table every f entries
    let g; // maximum code length
    let h; // table level
    let i; // counter, current code
    let j; // counter
    let k; // number of bits in current code
    let l; // bits per table (returned in m)
    let mask; // (1 << w) - 1, to avoid cc -O bug on HP
    let p; // pointer into c[], b[], or v[]
    let q; // points to current table
    let w; // bits before this table == (l * h)
    let xp; // pointer into x
    let y; // number of dummy codes added
    let z; // number of entries in current table
    // Generate counts for each bit length
    p = 0;
    i = n;
    do {
        c[b[bindex + p]]++;
        p++;
        i--; // assume all entries <= BMAX
    } while (i !== 0);
    if (c[0] === n) { // null input--all zero length codes
        t[0] = -1;
        m[0] = 0;
        return 0 /* OK */;
    }
    // Find minimum and maximum length, bound *m by those
    l = m[0];
    for (j = 1; j <= BMAX; j++) {
        if (c[j] !== 0) {
            break;
        }
    }
    k = j; // minimum code length
    if (l < j) {
        l = j;
    }
    for (i = BMAX; i !== 0; i--) {
        if (c[i] !== 0) {
            break;
        }
    }
    g = i; // maximum code length
    if (l > i) {
        l = i;
    }
    m[0] = l;
    // Adjust last length count to fill out codes, if needed
    for (y = 1 << j; j < i; j++, y <<= 1) {
        y -= c[j];
        if (y < 0) {
            return -3 /* DATA_ERROR */;
        }
    }
    y -= c[i];
    if (y < 0) {
        return -3 /* DATA_ERROR */;
    }
    c[i] += y;
    // Generate starting offsets into the value table for each length
    x[1] = j = 0;
    p = 1;
    xp = 2;
    while (--i !== 0) { // note that i == g from above
        x[xp] = (j += c[p]);
        xp++;
        p++;
    }
    // Make a table of values in order of bit lengths
    i = 0;
    p = 0;
    do {
        j = b[bindex + p];
        if (j !== 0) {
            v[x[j]++] = i;
        }
        p++;
    } while (++i < n);
    n = x[g]; // set n to length of v
    // Generate the Huffman codes and for each, make the table entries
    x[0] = i = 0; // first Huffman code is zero
    p = 0; // grab values in bit order
    h = -1; // no tables yet--level -1
    w = -l; // bits decoded == (l * h)
    u[0] = 0; // just to keep compilers happy
    q = 0; // ditto
    z = 0; // ditto
    // go through the bit lengths (k already is bits in shortest code)
    for (; k <= g; k++) {
        a = c[k];
        while (a-- !== 0) {
            // here i is the Huffman code of length k bits for value *p
            // make tables up to required level
            while (k > w + l) {
                h++;
                w += l; // previous table always l bits
                // compute minimum size table less than or equal to l bits
                z = g - w;
                z = (z > l) ? l : z; // table size upper limit
                f = 1 << (j = k - w);
                if (f > a + 1) { // try a k-w bit table
                    // too few codes for
                    // k-w bit table
                    f -= a + 1; // deduct codes from patterns left
                    xp = k;
                    if (j < z) {
                        while (++j < z) { // try smaller tables up to z bits
                            f <<= 1;
                            if (f <= c[++xp]) {
                                break; // enough codes to use up j bits
                            }
                            f -= c[xp]; // else deduct codes from patterns
                        }
                    }
                }
                z = 1 << j; // table entries for j-bit table
                // allocate new table
                if (hn[0] + z > 1400 /* MANY */) { // (note: doesn't matter for fixed)
                    return -3 /* DATA_ERROR */; // overflow of ZLimits.MANY
                }
                u[h] = q = /* hp+ */ hn[0]; // DEBUG
                hn[0] += z;
                // connect to last table, if there is one
                if (h !== 0) {
                    x[h] = i; // save pattern for backing up
                    r[0] = /* (byte) */ j; // bits in this table
                    r[1] = /* (byte) */ l; // bits to dump before this table
                    j = i >>> (w - l);
                    r[2] = /* (int) */ (q - u[h - 1] - j); // offset to this table
                    hp.set(r, (u[h - 1] + j) * 3);
                    // to
                    // last
                    // table
                }
                else {
                    t[0] = q; // first table is returned result
                }
            }
            // set up table entry in r
            r[1] = /* (byte) */ (k - w);
            if (p >= n) {
                r[0] = 128 + 64; // out of values--invalid code
            }
            else if (v[p] < s) {
                r[0] = /* (byte) */ (v[p] < 256 ? 0 : 32 + 64); // 256 is end-of-block
                r[2] = v[p++]; // simple code is just the value
            }
            else {
                r[0] = /* (byte) */ (e[v[p] - s] + 16 + 64); // non-simple--look up in lists
                r[2] = d[v[p++] - s];
            }
            // fill code-like entries with r
            f = 1 << (k - w);
            for (j = i >>> w; j < z; j += f) {
                hp.set(r, (q + j) * 3);
            }
            // backwards increment the k-bit code i
            for (j = 1 << (k - 1); (i & j) !== 0; j >>>= 1) {
                i ^= j;
            }
            i ^= j;
            // backup over finished tables
            mask = (1 << w) - 1; // needed on HP, cc -O bug
            while ((i & mask) !== x[h]) {
                h--; // don't need to update q
                w -= l;
                mask = (1 << w) - 1;
            }
        }
    }
    // Return ZStatus.BUF_ERROR if we were given an incomplete table
    return y !== 0 && g !== 1 ? -5 /* BUF_ERROR */ : 0 /* OK */;
}
function initWorkArea(vsize) {
    v = new Int32Array(vsize);
    for (let i = 0; i < BMAX + 1; i++) {
        c[i] = 0;
        u[i] = 0; // BMAX + 1 entry is silenty ignored
        x[i] = 0;
    }
    for (let i = 0; i < 3; i++) {
        r[i] = 0;
    }
}
function inflate_trees_bits(c, // 19 code lengths
bb, // bits tree desired/actual depth
tb, // bits tree result
hp, // space for trees
z // for messages
) {
    initWorkArea(19);
    hn[0] = 0;
    let result = huft_build(c, 0, 19, 19, null, null, tb, bb, hp, hn, v);
    if (result === -3 /* DATA_ERROR */) {
        z.msg = "oversubscribed dynamic bit lengths tree";
    }
    else if (result === -5 /* BUF_ERROR */ || bb[0] === 0) {
        z.msg = "incomplete dynamic bit lengths tree";
        result = -3 /* DATA_ERROR */;
    }
    return result;
}
function inflate_trees_dynamic(nl, // number of literal/length codes
nd, // number of distance codes
c, // that many (total) code lengths
bl, // literal desired/actual bit depth
bd, // distance desired/actual bit depth
tl, // literal/length tree result
td, // distance tree result
hp, // space for trees
z // for messages
) {
    // build literal/length tree
    initWorkArea(288);
    hn[0] = 0;
    let result = huft_build(c, 0, nl, 257, cplens, cplext, tl, bl, hp, hn, v);
    if (result !== 0 /* OK */ || bl[0] === 0) {
        if (result === -3 /* DATA_ERROR */) {
            z.msg = "oversubscribed literal/length tree";
        }
        else {
            z.msg = "incomplete literal/length tree";
            result = -3 /* DATA_ERROR */;
        }
        return result;
    }
    // build distance tree
    initWorkArea(288);
    result = huft_build(c, nl, nd, 0, cpdist, cpdext, td, bd, hp, hn, v);
    if (result !== 0 /* OK */ || (bd[0] === 0 && nl > 257)) {
        if (result === -3 /* DATA_ERROR */) {
            z.msg = "oversubscribed distance tree";
        }
        else if (result === -5 /* BUF_ERROR */) {
            z.msg = "incomplete distance tree";
            result = -3 /* DATA_ERROR */;
        }
        else {
            z.msg = "empty distance tree with lengths";
            result = -3 /* DATA_ERROR */;
        }
        return result;
    }
    return 0 /* OK */;
}
function inflate_trees_fixed(bl, // literal desired/actual bit depth
bd, // distance desired/actual bit depth
tl, // literal/length tree result
td // distance tree result
) {
    bl[0] = fixed_bl;
    bd[0] = fixed_bd;
    tl[0] = fixed_tl;
    td[0] = fixed_td;
    return 0 /* OK */;
}

// InfBlocks
// Table for deflate from PKZIP's appnote.txt.
const border = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
];
class InfBlocks {
    constructor(windowSize) {
        this.codes = InfCodes();
        this.hufts = new Int32Array(1400 /* MANY */ * 3); // single malloc for tree space
        this.mode = 0 /* TYPE */;
        this.bitk = 0; // bits in bit buffer
        this.bitb = 0; // bit buffer
        this.read = 0; // window read pointer
        this.write = 0; // window write pointer
        this.end = windowSize;
        this.window = new Uint8Array(windowSize);
    }
    reset() {
        this.bitk = 0;
        this.bitb = 0;
        this.read = 0;
        this.write = 0;
    }
    // copy as much as possible from the sliding window to the output area
    inflate_flush(z, r) {
        let n;
        let p;
        let q;
        // local copies of source and destination pointers
        p = z.next_out_index;
        q = this.read;
        // compute number of bytes to copy as far as end of window
        n = /* (int) */ ((q <= this.write ? this.write : this.end) - q);
        if (n > z.avail_out) {
            n = z.avail_out;
        }
        if (n !== 0 && r === -5 /* BUF_ERROR */) {
            r = 0 /* OK */;
        }
        // update counters
        z.avail_out -= n;
        z.total_out += n;
        // copy as far as end of window
        z.next_out.set(this.window.subarray(q, q + n), p);
        p += n;
        q += n;
        // see if more to copy at beginning of window
        if (q === this.end) {
            // wrap pointers
            q = 0;
            if (this.write === this.end) {
                this.write = 0;
            }
            // compute bytes to copy
            n = this.write - q;
            if (n > z.avail_out) {
                n = z.avail_out;
            }
            if (n !== 0 && r === -5 /* BUF_ERROR */) {
                r = 0 /* OK */;
            }
            // update counters
            z.avail_out -= n;
            z.total_out += n;
            // copy
            z.next_out.set(this.window.subarray(q, q + n), p);
            p += n;
            q += n;
        }
        // update pointers
        z.next_out_index = p;
        this.read = q;
        // done
        return r;
    }
    proc(z, r) {
        let t; // temporary storage
        let b; // bit buffer
        let k; // bits in bit buffer
        let p; // input data pointer
        let n; // bytes available there
        let q; // output window write pointer
        let m; // bytes to end of window or read pointer
        let i;
        let left = 0; // if Mode.STORED, bytes left to copy
        let table = 0; // table lengths (14 bits)
        let index = 0; // index into blens (or border)
        let blens = []; // bit lengths of codes
        const bb = [0]; // bit length tree depth
        const tb = [0]; // bit length decoding tree
        const codes = this.codes; // if Mode.CODES, current state
        const hufts = this.hufts;
        let last = 0; // true if this block is the last block
        // copy input/output information to locals (UPDATE macro restores)
        // {
        p = z.next_in_index;
        n = z.avail_in;
        b = this.bitb;
        k = this.bitk;
        // }
        // {
        q = this.write;
        m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
        // }
        // process input based on current state
        // DEBUG dtree
        while (true) {
            switch (this.mode) {
                case 0 /* TYPE */:
                    while (k < (3)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            this.bitb = b;
                            this.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            this.write = q;
                            return this.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    t = /* (int) */ (b & 7);
                    last = t & 1;
                    switch (t >>> 1) {
                        case 0: // stored
                            // {
                            b >>>= (3);
                            k -= (3);
                            // }
                            t = k & 7; // go to byte boundary
                            // {
                            b >>>= (t);
                            k -= (t);
                            // }
                            this.mode = 1 /* LENS */; // get length of stored block
                            break;
                        case 1: // fixed
                            // {
                            const bl = [0];
                            const bd = [0];
                            const tl = [[]];
                            const td = [[]];
                            inflate_trees_fixed(bl, bd, tl, td);
                            codes.init(bl[0], bd[0], tl[0], 0, td[0], 0);
                            // }
                            // {
                            b >>>= (3);
                            k -= (3);
                            // }
                            this.mode = 6 /* CODES */;
                            break;
                        case 2: // dynamic
                            // {
                            b >>>= (3);
                            k -= (3);
                            // }
                            this.mode = 3 /* TABLE */;
                            break;
                        case 3: // illegal
                            // {
                            b >>>= (3);
                            k -= (3);
                            // }
                            this.mode = 9 /* BADBLOCKS */;
                            z.msg = "invalid block type";
                            r = -3 /* DATA_ERROR */;
                            this.bitb = b;
                            this.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            this.write = q;
                            return this.inflate_flush(z, r);
                    }
                    break;
                case 1 /* LENS */:
                    while (k < (32)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            this.bitb = b;
                            this.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            this.write = q;
                            return this.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    if ((((~b) >>> 16) & 0xffff) !== (b & 0xffff)) {
                        this.mode = 9 /* BADBLOCKS */;
                        z.msg = "invalid stored block lengths";
                        r = -3 /* DATA_ERROR */;
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    left = (b & 0xffff);
                    b = k = 0; // dump bits
                    this.mode = left !== 0 ? 2 /* STORED */ : (last !== 0 ? 7 /* DRY */ : 0 /* TYPE */);
                    break;
                case 2 /* STORED */:
                    if (n === 0) {
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    if (m === 0) {
                        if (q === this.end && this.read !== 0) {
                            q = 0;
                            m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
                        }
                        if (m === 0) {
                            this.write = q;
                            r = this.inflate_flush(z, r);
                            q = this.write;
                            m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
                            if (q === this.end && this.read !== 0) {
                                q = 0;
                                m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
                            }
                            if (m === 0) {
                                this.bitb = b;
                                this.bitk = k;
                                z.avail_in = n;
                                z.total_in += p - z.next_in_index;
                                z.next_in_index = p;
                                this.write = q;
                                return this.inflate_flush(z, r);
                            }
                        }
                    }
                    r = 0 /* OK */;
                    t = left;
                    if (t > n) {
                        t = n;
                    }
                    if (t > m) {
                        t = m;
                    }
                    this.window.set(z.read_buf(p, t), q);
                    p += t;
                    n -= t;
                    q += t;
                    m -= t;
                    left -= t;
                    if (left !== 0) {
                        break;
                    }
                    this.mode = last !== 0 ? 7 /* DRY */ : 0 /* TYPE */;
                    break;
                case 3 /* TABLE */:
                    while (k < (14)) {
                        if (n !== 0) {
                            r = 0 /* OK */;
                        }
                        else {
                            this.bitb = b;
                            this.bitk = k;
                            z.avail_in = n;
                            z.total_in += p - z.next_in_index;
                            z.next_in_index = p;
                            this.write = q;
                            return this.inflate_flush(z, r);
                        }
                        n--;
                        b |= (z.next_in[p++] & 0xff) << k;
                        k += 8;
                    }
                    table = t = (b & 0x3fff);
                    if ((t & 0x1f) > 29 || ((t >> 5) & 0x1f) > 29) {
                        this.mode = 9 /* BADBLOCKS */;
                        z.msg = "too many length or distance symbols";
                        r = -3 /* DATA_ERROR */;
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    t = 258 + (t & 0x1f) + ((t >> 5) & 0x1f);
                    if (blens.length < t) {
                        blens = []; // new Array(t);
                    }
                    else {
                        for (i = 0; i < t; i++) {
                            blens[i] = 0;
                        }
                    }
                    // {
                    b >>>= (14);
                    k -= (14);
                    // }
                    index = 0;
                    this.mode = 4 /* BTREE */;
                    /* falls through */
                    // case Mode.BTREE:
                    while (index < 4 + (table >>> 10)) {
                        while (k < (3)) {
                            if (n !== 0) {
                                r = 0 /* OK */;
                            }
                            else {
                                this.bitb = b;
                                this.bitk = k;
                                z.avail_in = n;
                                z.total_in += p - z.next_in_index;
                                z.next_in_index = p;
                                this.write = q;
                                return this.inflate_flush(z, r);
                            }
                            n--;
                            b |= (z.next_in[p++] & 0xff) << k;
                            k += 8;
                        }
                        blens[border[index++]] = b & 7;
                        // {
                        b >>>= (3);
                        k -= (3);
                        // }
                    }
                    while (index < 19) {
                        blens[border[index++]] = 0;
                    }
                    bb[0] = 7;
                    t = inflate_trees_bits(blens, bb, tb, hufts, z);
                    if (t !== 0 /* OK */) {
                        r = t;
                        if (r === -3 /* DATA_ERROR */) {
                            // blens = null;
                            this.mode = 9 /* BADBLOCKS */;
                        }
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    index = 0;
                    this.mode = 5 /* DTREE */;
                    /* falls through */
                    // case Mode.DTREE:
                    while (true) {
                        t = table;
                        if (index >= 258 + (t & 0x1f) + ((t >> 5) & 0x1f)) {
                            break;
                        }
                        let j, c;
                        t = bb[0];
                        while (k < (t)) {
                            if (n !== 0) {
                                r = 0 /* OK */;
                            }
                            else {
                                this.bitb = b;
                                this.bitk = k;
                                z.avail_in = n;
                                z.total_in += p - z.next_in_index;
                                z.next_in_index = p;
                                this.write = q;
                                return this.inflate_flush(z, r);
                            }
                            n--;
                            b |= (z.next_in[p++] & 0xff) << k;
                            k += 8;
                        }
                        // if (tb[0] == -1) {
                        // System.err.println("null...");
                        // }
                        t = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 1];
                        c = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 2];
                        if (c < 16) {
                            b >>>= (t);
                            k -= (t);
                            blens[index++] = c;
                        }
                        else { // c == 16..18
                            i = c === 18 ? 7 : c - 14;
                            j = c === 18 ? 11 : 3;
                            while (k < (t + i)) {
                                if (n !== 0) {
                                    r = 0 /* OK */;
                                }
                                else {
                                    this.bitb = b;
                                    this.bitk = k;
                                    z.avail_in = n;
                                    z.total_in += p - z.next_in_index;
                                    z.next_in_index = p;
                                    this.write = q;
                                    return this.inflate_flush(z, r);
                                }
                                n--;
                                b |= (z.next_in[p++] & 0xff) << k;
                                k += 8;
                            }
                            b >>>= (t);
                            k -= (t);
                            j += (b & inflate_mask[i]);
                            b >>>= (i);
                            k -= (i);
                            i = index;
                            t = table;
                            if (i + j > 258 + (t & 0x1f) + ((t >> 5) & 0x1f) || (c === 16 && i < 1)) {
                                this.mode = 9 /* BADBLOCKS */;
                                z.msg = "invalid bit length repeat";
                                r = -3 /* DATA_ERROR */;
                                this.bitb = b;
                                this.bitk = k;
                                z.avail_in = n;
                                z.total_in += p - z.next_in_index;
                                z.next_in_index = p;
                                this.write = q;
                                return this.inflate_flush(z, r);
                            }
                            c = c === 16 ? blens[i - 1] : 0;
                            do {
                                blens[i++] = c;
                            } while (--j !== 0);
                            index = i;
                        }
                    }
                    tb[0] = -1;
                    // {
                    const bl_ = [9]; // must be <= 9 for lookahead assumptions
                    const bd_ = [6]; // must be <= 9 for lookahead assumptions
                    const tl_ = [0];
                    const td_ = [0];
                    t = inflate_trees_dynamic(257 + (t & 0x1f), 1 + ((t >> 5) & 0x1f), blens, bl_, bd_, tl_, td_, hufts, z);
                    if (t !== 0 /* OK */) {
                        if (t === -3 /* DATA_ERROR */) {
                            this.mode = 9 /* BADBLOCKS */;
                        }
                        r = t;
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    codes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);
                    // }
                    this.mode = 6 /* CODES */;
                /* falls through */
                case 6 /* CODES */:
                    this.bitb = b;
                    this.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    this.write = q;
                    r = codes.proc(this, z, r);
                    if (r !== 1 /* STREAM_END */) {
                        return this.inflate_flush(z, r);
                    }
                    r = 0 /* OK */;
                    p = z.next_in_index;
                    n = z.avail_in;
                    b = this.bitb;
                    k = this.bitk;
                    q = this.write;
                    m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
                    if (last === 0) {
                        this.mode = 0 /* TYPE */;
                        break;
                    }
                    this.mode = 7 /* DRY */;
                /* falls through */
                case 7 /* DRY */:
                    this.write = q;
                    r = this.inflate_flush(z, r);
                    q = this.write;
                    m = /* (int) */ (q < this.read ? this.read - q - 1 : this.end - q);
                    if (this.read !== this.write) {
                        this.bitb = b;
                        this.bitk = k;
                        z.avail_in = n;
                        z.total_in += p - z.next_in_index;
                        z.next_in_index = p;
                        this.write = q;
                        return this.inflate_flush(z, r);
                    }
                    this.mode = 8 /* DONELOCKS */;
                /* falls through */
                case 8 /* DONELOCKS */:
                    r = 1 /* STREAM_END */;
                    this.bitb = b;
                    this.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    this.write = q;
                    return this.inflate_flush(z, r);
                case 9 /* BADBLOCKS */:
                    r = -3 /* DATA_ERROR */;
                    this.bitb = b;
                    this.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    this.write = q;
                    return this.inflate_flush(z, r);
                default:
                    r = -2 /* STREAM_ERROR */;
                    this.bitb = b;
                    this.bitk = k;
                    z.avail_in = n;
                    z.total_in += p - z.next_in_index;
                    z.next_in_index = p;
                    this.write = q;
                    return this.inflate_flush(z, r);
            }
        }
    }
    set_dictionary(d, start, n) {
        this.window.set(d.subarray(start, start + n), 0);
        this.read = this.write = n;
    }
}

/**
 * adler32 -- compute the Adler-32 checksum of a data stream
 * Copyright (C) 1995-2011, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from adler32.c, which can be found at:
 * https://github.com/madler/zlib/blob/master/adler32.c
 */
const BASE = 65521; /* largest prime smaller than 65536 */
const NMAX = 5552;
/**
 * Compute the Adler-32 checksum of a sequence of unsigned bytes.
 * Make very sure that the individual elements in buf are all
 * in the UNSIGNED byte range (i.e. 0..255) otherwise the
 * result will be indeterminate.
 * @param buf Source data, an array-like of unsigned bytes
 * @param adler Optional seed for the checksum
 */
function adler32Bytes(buf, adler = 1) {
    /* split Adler-32 into component sums */
    let sum2 = (adler >>> 16) & 0xffff;
    adler &= 0xffff;
    let len = buf.length;
    let offset = 0;
    /* do length NMAX blocks -- requires just one modulo operation */
    while (len >= NMAX) {
        len -= NMAX;
        let n = NMAX / 16; /* NMAX is divisible by 16 */
        do {
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
        } while (--n);
        adler %= BASE;
        sum2 += BASE;
    }
    /* do remaining bytes (less than NMAX, still just one modulo) */
    if (len) { /* avoid modulos if none remaining */
        while (len >= 16) {
            len -= 16;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
            adler += buf[offset++];
            sum2 += adler;
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

// Inflate
// preset dictionary flag in zlib header
const PRESET_DICT = 0x20;
const Z_DEFLATED = 8;
const mark = [0, 0, 0xff, 0xff];
class Inflate {
    constructor(windowSizeBits = 15 /* MAX_BITS */) {
        // mode dependent information
        this.method = 0; // if FLAGS, method byte
        this.dictChecksum = 0; // expected checksum of external dictionary
        // if Mode.BAD, inflateSync's marker bytes count
        this.marker = 0;
        // mode independent information
        this.wbits = 0; // log2(window size) (8..15, defaults to 15)
        if (windowSizeBits < 8 /* MIN_BITS */ || windowSizeBits > 15 /* MAX_BITS */) {
            throw new Error("Invalid window size");
        }
        this.wbits = windowSizeBits;
        this.blocks = new InfBlocks(1 << windowSizeBits);
        this.mode = 0 /* METHOD */;
    }
    inflate(z) {
        let b;
        if (!z || !z.next_in) {
            return -2 /* STREAM_ERROR */;
        }
        const f = 0 /* OK */;
        let r = -5 /* BUF_ERROR */;
        while (true) {
            switch (this.mode) {
                case 0 /* METHOD */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    this.method = z.next_in[z.next_in_index++];
                    if ((this.method & 0xf) !== Z_DEFLATED) {
                        this.mode = 13 /* BAD */;
                        z.msg = "unknown compression method";
                        this.marker = 5; // can't try inflateSync
                        break;
                    }
                    if ((this.method >> 4) + 8 > this.wbits) {
                        this.mode = 13 /* BAD */;
                        z.msg = "invalid window size";
                        this.marker = 5; // can't try inflateSync
                        break;
                    }
                    this.mode = 1 /* FLAG */;
                /* falls through */
                case 1 /* FLAG */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    b = (z.next_in[z.next_in_index++]) & 0xff;
                    if ((((this.method << 8) + b) % 31) !== 0) {
                        this.mode = 13 /* BAD */;
                        z.msg = "incorrect header check";
                        this.marker = 5; // can't try inflateSync
                        break;
                    }
                    if ((b & PRESET_DICT) === 0) {
                        this.mode = 7 /* BLOCKS */;
                        break;
                    }
                    this.mode = 2 /* DICT4 */;
                /* falls through */
                case 2 /* DICT4 */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    this.dictChecksum = ((z.next_in[z.next_in_index++] & 0xff) << 24) & 0xff000000;
                    this.mode = 3 /* DICT3 */;
                /* falls through */
                case 3 /* DICT3 */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    this.dictChecksum |= ((z.next_in[z.next_in_index++] & 0xff) << 16) & 0xff0000;
                    this.mode = 4 /* DICT2 */;
                /* falls through */
                case 4 /* DICT2 */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    this.dictChecksum |= ((z.next_in[z.next_in_index++] & 0xff) << 8) & 0xff00;
                    this.mode = 5 /* DICT1 */;
                /* falls through */
                case 5 /* DICT1 */:
                    if (z.avail_in === 0) {
                        return r;
                    }
                    r = f;
                    z.avail_in--;
                    z.total_in++;
                    this.dictChecksum |= (z.next_in[z.next_in_index++] & 0xff);
                    this.mode = 6 /* DICT0 */;
                    return 2 /* NEED_DICT */;
                case 6 /* DICT0 */:
                    this.mode = 13 /* BAD */;
                    z.msg = "need dictionary";
                    this.marker = 0; // can try inflateSync
                    return -2 /* STREAM_ERROR */;
                case 7 /* BLOCKS */:
                    r = this.blocks.proc(z, r);
                    if (r === -3 /* DATA_ERROR */) {
                        this.mode = 13 /* BAD */;
                        this.marker = 0; // can try inflateSync
                        break;
                    }
                    if (r !== 1 /* STREAM_END */) {
                        return r;
                    }
                    r = f;
                    this.blocks.reset();
                    this.mode = 12 /* DONE */;
                /* falls through */
                case 12 /* DONE */:
                    return 1 /* STREAM_END */;
                case 13 /* BAD */:
                    return -3 /* DATA_ERROR */;
                default:
                    return -2 /* STREAM_ERROR */;
            }
        }
    }
    inflateSetDictionary(dictionary) {
        if (this.mode !== 6 /* DICT0 */) {
            return -2 /* STREAM_ERROR */;
        }
        let index = 0;
        let length = dictionary.byteLength;
        if (length >= (1 << this.wbits)) {
            length = (1 << this.wbits) - 1;
            index = dictionary.byteLength - length;
        }
        // verify dictionary checksum
        const checksum = adler32Bytes(dictionary);
        if (checksum !== this.dictChecksum) {
            throw new Error("Dictionary checksum mismatch");
        }
        this.blocks.set_dictionary(dictionary, index, length);
        this.mode = 7 /* BLOCKS */;
        return 0 /* OK */;
    }
    inflateSync(z) {
        let n; // number of bytes to look at
        let p; // pointer to bytes
        let m; // number of marker bytes found in a row
        // set up
        if (!z || !z.next_in) {
            return -2 /* STREAM_ERROR */;
        }
        if (this.mode !== 13 /* BAD */) {
            this.mode = 13 /* BAD */;
            this.marker = 0;
        }
        n = z.avail_in;
        if (n === 0) {
            return -5 /* BUF_ERROR */;
        }
        p = z.next_in_index;
        m = this.marker;
        // search
        while (n !== 0 && m < 4) {
            if (z.next_in[p] === mark[m]) {
                m++;
            }
            else if (z.next_in[p] !== 0) {
                m = 0;
            }
            else {
                m = 4 - m;
            }
            p++;
            n--;
        }
        // restore
        z.total_in += p - z.next_in_index;
        z.next_in_index = p;
        z.avail_in = n;
        this.marker = m;
        // return no joy or set up to restart on a new block
        if (m !== 4) {
            return -3 /* DATA_ERROR */;
        }
        this.blocks.reset();
        this.mode = 7 /* BLOCKS */;
        return 0 /* OK */;
    }
}

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
function Inflater() {
    const inflate = new Inflate();
    const z = new ZStream();
    const bufsize = 16384;
    let nomoreinput = false;
    const append = function (data) {
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
            if (nomoreinput && (err === -5 /* BUF_ERROR */)) {
                if (z.avail_in !== 0) {
                    throw new Error("inflating: bad input");
                }
            }
            else if (err !== 0 /* OK */ && err !== 1 /* STREAM_END */) {
                throw new Error("inflating: " + z.msg);
            }
            if ((nomoreinput || err === 1 /* STREAM_END */) && (z.avail_in === data.length)) {
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
        buffers.forEach(function (chunk) {
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
