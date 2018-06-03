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
 * https://github.com/madler/zlib/blob/v1.2.11/adler32.c
 */
const BASE = 65521; /* largest prime smaller than 65536 */
const NMAX = 5552;
/**
 * Compute the Adler-32 checksum of a source.
 * This method will do its best to get a correct stream of unsigned bytes out
 * of the specified input, but take care when passing in basic arrays.
 * You can use `adler32Bytes` for the "I know what I'm doing" version.
 * @param data Source data, a string, array, TypedArray or ArrayBuffer
 * @param adler Optional seed for the checksum
 */
function adler32(data, seed = 1) {
    let buf;
    if (typeof data === "string") {
        const encoder = new TextEncoder();
        buf = encoder.encode(data);
    }
    else if ("buffer" in data) {
        if (data.constructor !== Uint8Array && data.constructor !== Uint8ClampedArray) {
            // create an unsigned byte view over the existing view
            buf = new Uint8Array(data.buffer, data.byteOffset, data.length * data.BYTES_PER_ELEMENT);
        }
        else {
            buf = data;
        }
    }
    else if ("byteLength" in data) {
        buf = new Uint8Array(data);
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
 * result will be indeterminate. Use `adler32` for safest results.
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
/**
 * Combine 2 Adler32 checksums as if the data yielding adler1
 * and adler2 was concatenated and the total checksum was calculated.
 * @param adler1 Adler32 checksum of buffer 1
 * @param adler2 Adler32 checksum of buffer 2
 * @param len2 The length in bytes of the buffer used to calculate adler2
 */
function adler32Combine(adler1, adler2, len2) {
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
    if (sum1 >= BASE) {
        sum1 -= BASE;
    }
    if (sum1 >= BASE) {
        sum1 -= BASE;
    }
    if (sum2 >= (BASE << 1)) {
        sum2 -= (BASE << 1);
    }
    if (sum2 >= BASE) {
        sum2 -= BASE;
    }
    return sum1 | (sum2 << 16);
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
 * crc32 -- compute the CRC32 checksum of a data stream
 * Copyright (C) 1995-2006, 2010, 2011, 2012, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from crc32.c/h, which can be found at:
 * https://github.com/madler/zlib/blob/v1.2.11/crc32.c
 */
const crcTables = [
    [
        0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419,
        0x706af48f, 0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4,
        0xe0d5e91e, 0x97d2d988, 0x09b64c2b, 0x7eb17cbd, 0xe7b82d07,
        0x90bf1d91, 0x1db71064, 0x6ab020f2, 0xf3b97148, 0x84be41de,
        0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7, 0x136c9856,
        0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
        0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4,
        0xa2677172, 0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b,
        0x35b5a8fa, 0x42b2986c, 0xdbbbc9d6, 0xacbcf940, 0x32d86ce3,
        0x45df5c75, 0xdcd60dcf, 0xabd13d59, 0x26d930ac, 0x51de003a,
        0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423, 0xcfba9599,
        0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
        0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190,
        0x01db7106, 0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f,
        0x9fbfe4a5, 0xe8b8d433, 0x7807c9a2, 0x0f00f934, 0x9609a88e,
        0xe10e9818, 0x7f6a0dbb, 0x086d3d2d, 0x91646c97, 0xe6635c01,
        0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e, 0x6c0695ed,
        0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
        0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3,
        0xfbd44c65, 0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2,
        0x4adfa541, 0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a,
        0x346ed9fc, 0xad678846, 0xda60b8d0, 0x44042d73, 0x33031de5,
        0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa, 0xbe0b1010,
        0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
        0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17,
        0x2eb40d81, 0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6,
        0x03b6e20c, 0x74b1d29a, 0xead54739, 0x9dd277af, 0x04db2615,
        0x73dc1683, 0xe3630b12, 0x94643b84, 0x0d6d6a3e, 0x7a6a5aa8,
        0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1, 0xf00f9344,
        0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
        0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a,
        0x67dd4acc, 0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5,
        0xd6d6a3e8, 0xa1d1937e, 0x38d8c2c4, 0x4fdff252, 0xd1bb67f1,
        0xa6bc5767, 0x3fb506dd, 0x48b2364b, 0xd80d2bda, 0xaf0a1b4c,
        0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55, 0x316e8eef,
        0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
        0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe,
        0xb2bd0b28, 0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31,
        0x2cd99e8b, 0x5bdeae1d, 0x9b64c2b0, 0xec63f226, 0x756aa39c,
        0x026d930a, 0x9c0906a9, 0xeb0e363f, 0x72076785, 0x05005713,
        0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38, 0x92d28e9b,
        0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
        0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1,
        0x18b74777, 0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c,
        0x8f659eff, 0xf862ae69, 0x616bffd3, 0x166ccf45, 0xa00ae278,
        0xd70dd2ee, 0x4e048354, 0x3903b3c2, 0xa7672661, 0xd06016f7,
        0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc, 0x40df0b66,
        0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
        0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605,
        0xcdd70693, 0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8,
        0x5d681b02, 0x2a6f2b94, 0xb40bbe37, 0xc30c8ea1, 0x5a05df1b,
        0x2d02ef8d
    ],
    [
        0x00000000, 0x191b3141, 0x32366282, 0x2b2d53c3, 0x646cc504,
        0x7d77f445, 0x565aa786, 0x4f4196c7, 0xc8d98a08, 0xd1c2bb49,
        0xfaefe88a, 0xe3f4d9cb, 0xacb54f0c, 0xb5ae7e4d, 0x9e832d8e,
        0x87981ccf, 0x4ac21251, 0x53d92310, 0x78f470d3, 0x61ef4192,
        0x2eaed755, 0x37b5e614, 0x1c98b5d7, 0x05838496, 0x821b9859,
        0x9b00a918, 0xb02dfadb, 0xa936cb9a, 0xe6775d5d, 0xff6c6c1c,
        0xd4413fdf, 0xcd5a0e9e, 0x958424a2, 0x8c9f15e3, 0xa7b24620,
        0xbea97761, 0xf1e8e1a6, 0xe8f3d0e7, 0xc3de8324, 0xdac5b265,
        0x5d5daeaa, 0x44469feb, 0x6f6bcc28, 0x7670fd69, 0x39316bae,
        0x202a5aef, 0x0b07092c, 0x121c386d, 0xdf4636f3, 0xc65d07b2,
        0xed705471, 0xf46b6530, 0xbb2af3f7, 0xa231c2b6, 0x891c9175,
        0x9007a034, 0x179fbcfb, 0x0e848dba, 0x25a9de79, 0x3cb2ef38,
        0x73f379ff, 0x6ae848be, 0x41c51b7d, 0x58de2a3c, 0xf0794f05,
        0xe9627e44, 0xc24f2d87, 0xdb541cc6, 0x94158a01, 0x8d0ebb40,
        0xa623e883, 0xbf38d9c2, 0x38a0c50d, 0x21bbf44c, 0x0a96a78f,
        0x138d96ce, 0x5ccc0009, 0x45d73148, 0x6efa628b, 0x77e153ca,
        0xbabb5d54, 0xa3a06c15, 0x888d3fd6, 0x91960e97, 0xded79850,
        0xc7cca911, 0xece1fad2, 0xf5facb93, 0x7262d75c, 0x6b79e61d,
        0x4054b5de, 0x594f849f, 0x160e1258, 0x0f152319, 0x243870da,
        0x3d23419b, 0x65fd6ba7, 0x7ce65ae6, 0x57cb0925, 0x4ed03864,
        0x0191aea3, 0x188a9fe2, 0x33a7cc21, 0x2abcfd60, 0xad24e1af,
        0xb43fd0ee, 0x9f12832d, 0x8609b26c, 0xc94824ab, 0xd05315ea,
        0xfb7e4629, 0xe2657768, 0x2f3f79f6, 0x362448b7, 0x1d091b74,
        0x04122a35, 0x4b53bcf2, 0x52488db3, 0x7965de70, 0x607eef31,
        0xe7e6f3fe, 0xfefdc2bf, 0xd5d0917c, 0xcccba03d, 0x838a36fa,
        0x9a9107bb, 0xb1bc5478, 0xa8a76539, 0x3b83984b, 0x2298a90a,
        0x09b5fac9, 0x10aecb88, 0x5fef5d4f, 0x46f46c0e, 0x6dd93fcd,
        0x74c20e8c, 0xf35a1243, 0xea412302, 0xc16c70c1, 0xd8774180,
        0x9736d747, 0x8e2de606, 0xa500b5c5, 0xbc1b8484, 0x71418a1a,
        0x685abb5b, 0x4377e898, 0x5a6cd9d9, 0x152d4f1e, 0x0c367e5f,
        0x271b2d9c, 0x3e001cdd, 0xb9980012, 0xa0833153, 0x8bae6290,
        0x92b553d1, 0xddf4c516, 0xc4eff457, 0xefc2a794, 0xf6d996d5,
        0xae07bce9, 0xb71c8da8, 0x9c31de6b, 0x852aef2a, 0xca6b79ed,
        0xd37048ac, 0xf85d1b6f, 0xe1462a2e, 0x66de36e1, 0x7fc507a0,
        0x54e85463, 0x4df36522, 0x02b2f3e5, 0x1ba9c2a4, 0x30849167,
        0x299fa026, 0xe4c5aeb8, 0xfdde9ff9, 0xd6f3cc3a, 0xcfe8fd7b,
        0x80a96bbc, 0x99b25afd, 0xb29f093e, 0xab84387f, 0x2c1c24b0,
        0x350715f1, 0x1e2a4632, 0x07317773, 0x4870e1b4, 0x516bd0f5,
        0x7a468336, 0x635db277, 0xcbfad74e, 0xd2e1e60f, 0xf9ccb5cc,
        0xe0d7848d, 0xaf96124a, 0xb68d230b, 0x9da070c8, 0x84bb4189,
        0x03235d46, 0x1a386c07, 0x31153fc4, 0x280e0e85, 0x674f9842,
        0x7e54a903, 0x5579fac0, 0x4c62cb81, 0x8138c51f, 0x9823f45e,
        0xb30ea79d, 0xaa1596dc, 0xe554001b, 0xfc4f315a, 0xd7626299,
        0xce7953d8, 0x49e14f17, 0x50fa7e56, 0x7bd72d95, 0x62cc1cd4,
        0x2d8d8a13, 0x3496bb52, 0x1fbbe891, 0x06a0d9d0, 0x5e7ef3ec,
        0x4765c2ad, 0x6c48916e, 0x7553a02f, 0x3a1236e8, 0x230907a9,
        0x0824546a, 0x113f652b, 0x96a779e4, 0x8fbc48a5, 0xa4911b66,
        0xbd8a2a27, 0xf2cbbce0, 0xebd08da1, 0xc0fdde62, 0xd9e6ef23,
        0x14bce1bd, 0x0da7d0fc, 0x268a833f, 0x3f91b27e, 0x70d024b9,
        0x69cb15f8, 0x42e6463b, 0x5bfd777a, 0xdc656bb5, 0xc57e5af4,
        0xee530937, 0xf7483876, 0xb809aeb1, 0xa1129ff0, 0x8a3fcc33,
        0x9324fd72
    ],
    [
        0x00000000, 0x01c26a37, 0x0384d46e, 0x0246be59, 0x0709a8dc,
        0x06cbc2eb, 0x048d7cb2, 0x054f1685, 0x0e1351b8, 0x0fd13b8f,
        0x0d9785d6, 0x0c55efe1, 0x091af964, 0x08d89353, 0x0a9e2d0a,
        0x0b5c473d, 0x1c26a370, 0x1de4c947, 0x1fa2771e, 0x1e601d29,
        0x1b2f0bac, 0x1aed619b, 0x18abdfc2, 0x1969b5f5, 0x1235f2c8,
        0x13f798ff, 0x11b126a6, 0x10734c91, 0x153c5a14, 0x14fe3023,
        0x16b88e7a, 0x177ae44d, 0x384d46e0, 0x398f2cd7, 0x3bc9928e,
        0x3a0bf8b9, 0x3f44ee3c, 0x3e86840b, 0x3cc03a52, 0x3d025065,
        0x365e1758, 0x379c7d6f, 0x35dac336, 0x3418a901, 0x3157bf84,
        0x3095d5b3, 0x32d36bea, 0x331101dd, 0x246be590, 0x25a98fa7,
        0x27ef31fe, 0x262d5bc9, 0x23624d4c, 0x22a0277b, 0x20e69922,
        0x2124f315, 0x2a78b428, 0x2bbade1f, 0x29fc6046, 0x283e0a71,
        0x2d711cf4, 0x2cb376c3, 0x2ef5c89a, 0x2f37a2ad, 0x709a8dc0,
        0x7158e7f7, 0x731e59ae, 0x72dc3399, 0x7793251c, 0x76514f2b,
        0x7417f172, 0x75d59b45, 0x7e89dc78, 0x7f4bb64f, 0x7d0d0816,
        0x7ccf6221, 0x798074a4, 0x78421e93, 0x7a04a0ca, 0x7bc6cafd,
        0x6cbc2eb0, 0x6d7e4487, 0x6f38fade, 0x6efa90e9, 0x6bb5866c,
        0x6a77ec5b, 0x68315202, 0x69f33835, 0x62af7f08, 0x636d153f,
        0x612bab66, 0x60e9c151, 0x65a6d7d4, 0x6464bde3, 0x662203ba,
        0x67e0698d, 0x48d7cb20, 0x4915a117, 0x4b531f4e, 0x4a917579,
        0x4fde63fc, 0x4e1c09cb, 0x4c5ab792, 0x4d98dda5, 0x46c49a98,
        0x4706f0af, 0x45404ef6, 0x448224c1, 0x41cd3244, 0x400f5873,
        0x4249e62a, 0x438b8c1d, 0x54f16850, 0x55330267, 0x5775bc3e,
        0x56b7d609, 0x53f8c08c, 0x523aaabb, 0x507c14e2, 0x51be7ed5,
        0x5ae239e8, 0x5b2053df, 0x5966ed86, 0x58a487b1, 0x5deb9134,
        0x5c29fb03, 0x5e6f455a, 0x5fad2f6d, 0xe1351b80, 0xe0f771b7,
        0xe2b1cfee, 0xe373a5d9, 0xe63cb35c, 0xe7fed96b, 0xe5b86732,
        0xe47a0d05, 0xef264a38, 0xeee4200f, 0xeca29e56, 0xed60f461,
        0xe82fe2e4, 0xe9ed88d3, 0xebab368a, 0xea695cbd, 0xfd13b8f0,
        0xfcd1d2c7, 0xfe976c9e, 0xff5506a9, 0xfa1a102c, 0xfbd87a1b,
        0xf99ec442, 0xf85cae75, 0xf300e948, 0xf2c2837f, 0xf0843d26,
        0xf1465711, 0xf4094194, 0xf5cb2ba3, 0xf78d95fa, 0xf64fffcd,
        0xd9785d60, 0xd8ba3757, 0xdafc890e, 0xdb3ee339, 0xde71f5bc,
        0xdfb39f8b, 0xddf521d2, 0xdc374be5, 0xd76b0cd8, 0xd6a966ef,
        0xd4efd8b6, 0xd52db281, 0xd062a404, 0xd1a0ce33, 0xd3e6706a,
        0xd2241a5d, 0xc55efe10, 0xc49c9427, 0xc6da2a7e, 0xc7184049,
        0xc25756cc, 0xc3953cfb, 0xc1d382a2, 0xc011e895, 0xcb4dafa8,
        0xca8fc59f, 0xc8c97bc6, 0xc90b11f1, 0xcc440774, 0xcd866d43,
        0xcfc0d31a, 0xce02b92d, 0x91af9640, 0x906dfc77, 0x922b422e,
        0x93e92819, 0x96a63e9c, 0x976454ab, 0x9522eaf2, 0x94e080c5,
        0x9fbcc7f8, 0x9e7eadcf, 0x9c381396, 0x9dfa79a1, 0x98b56f24,
        0x99770513, 0x9b31bb4a, 0x9af3d17d, 0x8d893530, 0x8c4b5f07,
        0x8e0de15e, 0x8fcf8b69, 0x8a809dec, 0x8b42f7db, 0x89044982,
        0x88c623b5, 0x839a6488, 0x82580ebf, 0x801eb0e6, 0x81dcdad1,
        0x8493cc54, 0x8551a663, 0x8717183a, 0x86d5720d, 0xa9e2d0a0,
        0xa820ba97, 0xaa6604ce, 0xaba46ef9, 0xaeeb787c, 0xaf29124b,
        0xad6fac12, 0xacadc625, 0xa7f18118, 0xa633eb2f, 0xa4755576,
        0xa5b73f41, 0xa0f829c4, 0xa13a43f3, 0xa37cfdaa, 0xa2be979d,
        0xb5c473d0, 0xb40619e7, 0xb640a7be, 0xb782cd89, 0xb2cddb0c,
        0xb30fb13b, 0xb1490f62, 0xb08b6555, 0xbbd72268, 0xba15485f,
        0xb853f606, 0xb9919c31, 0xbcde8ab4, 0xbd1ce083, 0xbf5a5eda,
        0xbe9834ed
    ],
    [
        0x00000000, 0xb8bc6765, 0xaa09c88b, 0x12b5afee, 0x8f629757,
        0x37def032, 0x256b5fdc, 0x9dd738b9, 0xc5b428ef, 0x7d084f8a,
        0x6fbde064, 0xd7018701, 0x4ad6bfb8, 0xf26ad8dd, 0xe0df7733,
        0x58631056, 0x5019579f, 0xe8a530fa, 0xfa109f14, 0x42acf871,
        0xdf7bc0c8, 0x67c7a7ad, 0x75720843, 0xcdce6f26, 0x95ad7f70,
        0x2d111815, 0x3fa4b7fb, 0x8718d09e, 0x1acfe827, 0xa2738f42,
        0xb0c620ac, 0x087a47c9, 0xa032af3e, 0x188ec85b, 0x0a3b67b5,
        0xb28700d0, 0x2f503869, 0x97ec5f0c, 0x8559f0e2, 0x3de59787,
        0x658687d1, 0xdd3ae0b4, 0xcf8f4f5a, 0x7733283f, 0xeae41086,
        0x525877e3, 0x40edd80d, 0xf851bf68, 0xf02bf8a1, 0x48979fc4,
        0x5a22302a, 0xe29e574f, 0x7f496ff6, 0xc7f50893, 0xd540a77d,
        0x6dfcc018, 0x359fd04e, 0x8d23b72b, 0x9f9618c5, 0x272a7fa0,
        0xbafd4719, 0x0241207c, 0x10f48f92, 0xa848e8f7, 0x9b14583d,
        0x23a83f58, 0x311d90b6, 0x89a1f7d3, 0x1476cf6a, 0xaccaa80f,
        0xbe7f07e1, 0x06c36084, 0x5ea070d2, 0xe61c17b7, 0xf4a9b859,
        0x4c15df3c, 0xd1c2e785, 0x697e80e0, 0x7bcb2f0e, 0xc377486b,
        0xcb0d0fa2, 0x73b168c7, 0x6104c729, 0xd9b8a04c, 0x446f98f5,
        0xfcd3ff90, 0xee66507e, 0x56da371b, 0x0eb9274d, 0xb6054028,
        0xa4b0efc6, 0x1c0c88a3, 0x81dbb01a, 0x3967d77f, 0x2bd27891,
        0x936e1ff4, 0x3b26f703, 0x839a9066, 0x912f3f88, 0x299358ed,
        0xb4446054, 0x0cf80731, 0x1e4da8df, 0xa6f1cfba, 0xfe92dfec,
        0x462eb889, 0x549b1767, 0xec277002, 0x71f048bb, 0xc94c2fde,
        0xdbf98030, 0x6345e755, 0x6b3fa09c, 0xd383c7f9, 0xc1366817,
        0x798a0f72, 0xe45d37cb, 0x5ce150ae, 0x4e54ff40, 0xf6e89825,
        0xae8b8873, 0x1637ef16, 0x048240f8, 0xbc3e279d, 0x21e91f24,
        0x99557841, 0x8be0d7af, 0x335cb0ca, 0xed59b63b, 0x55e5d15e,
        0x47507eb0, 0xffec19d5, 0x623b216c, 0xda874609, 0xc832e9e7,
        0x708e8e82, 0x28ed9ed4, 0x9051f9b1, 0x82e4565f, 0x3a58313a,
        0xa78f0983, 0x1f336ee6, 0x0d86c108, 0xb53aa66d, 0xbd40e1a4,
        0x05fc86c1, 0x1749292f, 0xaff54e4a, 0x322276f3, 0x8a9e1196,
        0x982bbe78, 0x2097d91d, 0x78f4c94b, 0xc048ae2e, 0xd2fd01c0,
        0x6a4166a5, 0xf7965e1c, 0x4f2a3979, 0x5d9f9697, 0xe523f1f2,
        0x4d6b1905, 0xf5d77e60, 0xe762d18e, 0x5fdeb6eb, 0xc2098e52,
        0x7ab5e937, 0x680046d9, 0xd0bc21bc, 0x88df31ea, 0x3063568f,
        0x22d6f961, 0x9a6a9e04, 0x07bda6bd, 0xbf01c1d8, 0xadb46e36,
        0x15080953, 0x1d724e9a, 0xa5ce29ff, 0xb77b8611, 0x0fc7e174,
        0x9210d9cd, 0x2aacbea8, 0x38191146, 0x80a57623, 0xd8c66675,
        0x607a0110, 0x72cfaefe, 0xca73c99b, 0x57a4f122, 0xef189647,
        0xfdad39a9, 0x45115ecc, 0x764dee06, 0xcef18963, 0xdc44268d,
        0x64f841e8, 0xf92f7951, 0x41931e34, 0x5326b1da, 0xeb9ad6bf,
        0xb3f9c6e9, 0x0b45a18c, 0x19f00e62, 0xa14c6907, 0x3c9b51be,
        0x842736db, 0x96929935, 0x2e2efe50, 0x2654b999, 0x9ee8defc,
        0x8c5d7112, 0x34e11677, 0xa9362ece, 0x118a49ab, 0x033fe645,
        0xbb838120, 0xe3e09176, 0x5b5cf613, 0x49e959fd, 0xf1553e98,
        0x6c820621, 0xd43e6144, 0xc68bceaa, 0x7e37a9cf, 0xd67f4138,
        0x6ec3265d, 0x7c7689b3, 0xc4caeed6, 0x591dd66f, 0xe1a1b10a,
        0xf3141ee4, 0x4ba87981, 0x13cb69d7, 0xab770eb2, 0xb9c2a15c,
        0x017ec639, 0x9ca9fe80, 0x241599e5, 0x36a0360b, 0x8e1c516e,
        0x866616a7, 0x3eda71c2, 0x2c6fde2c, 0x94d3b949, 0x090481f0,
        0xb1b8e695, 0xa30d497b, 0x1bb12e1e, 0x43d23e48, 0xfb6e592d,
        0xe9dbf6c3, 0x516791a6, 0xccb0a91f, 0x740cce7a, 0x66b96194,
        0xde0506f1
    ],
    [
        0x00000000, 0x96300777, 0x2c610eee, 0xba510999, 0x19c46d07,
        0x8ff46a70, 0x35a563e9, 0xa395649e, 0x3288db0e, 0xa4b8dc79,
        0x1ee9d5e0, 0x88d9d297, 0x2b4cb609, 0xbd7cb17e, 0x072db8e7,
        0x911dbf90, 0x6410b71d, 0xf220b06a, 0x4871b9f3, 0xde41be84,
        0x7dd4da1a, 0xebe4dd6d, 0x51b5d4f4, 0xc785d383, 0x56986c13,
        0xc0a86b64, 0x7af962fd, 0xecc9658a, 0x4f5c0114, 0xd96c0663,
        0x633d0ffa, 0xf50d088d, 0xc8206e3b, 0x5e10694c, 0xe44160d5,
        0x727167a2, 0xd1e4033c, 0x47d4044b, 0xfd850dd2, 0x6bb50aa5,
        0xfaa8b535, 0x6c98b242, 0xd6c9bbdb, 0x40f9bcac, 0xe36cd832,
        0x755cdf45, 0xcf0dd6dc, 0x593dd1ab, 0xac30d926, 0x3a00de51,
        0x8051d7c8, 0x1661d0bf, 0xb5f4b421, 0x23c4b356, 0x9995bacf,
        0x0fa5bdb8, 0x9eb80228, 0x0888055f, 0xb2d90cc6, 0x24e90bb1,
        0x877c6f2f, 0x114c6858, 0xab1d61c1, 0x3d2d66b6, 0x9041dc76,
        0x0671db01, 0xbc20d298, 0x2a10d5ef, 0x8985b171, 0x1fb5b606,
        0xa5e4bf9f, 0x33d4b8e8, 0xa2c90778, 0x34f9000f, 0x8ea80996,
        0x18980ee1, 0xbb0d6a7f, 0x2d3d6d08, 0x976c6491, 0x015c63e6,
        0xf4516b6b, 0x62616c1c, 0xd8306585, 0x4e0062f2, 0xed95066c,
        0x7ba5011b, 0xc1f40882, 0x57c40ff5, 0xc6d9b065, 0x50e9b712,
        0xeab8be8b, 0x7c88b9fc, 0xdf1ddd62, 0x492dda15, 0xf37cd38c,
        0x654cd4fb, 0x5861b24d, 0xce51b53a, 0x7400bca3, 0xe230bbd4,
        0x41a5df4a, 0xd795d83d, 0x6dc4d1a4, 0xfbf4d6d3, 0x6ae96943,
        0xfcd96e34, 0x468867ad, 0xd0b860da, 0x732d0444, 0xe51d0333,
        0x5f4c0aaa, 0xc97c0ddd, 0x3c710550, 0xaa410227, 0x10100bbe,
        0x86200cc9, 0x25b56857, 0xb3856f20, 0x09d466b9, 0x9fe461ce,
        0x0ef9de5e, 0x98c9d929, 0x2298d0b0, 0xb4a8d7c7, 0x173db359,
        0x810db42e, 0x3b5cbdb7, 0xad6cbac0, 0x2083b8ed, 0xb6b3bf9a,
        0x0ce2b603, 0x9ad2b174, 0x3947d5ea, 0xaf77d29d, 0x1526db04,
        0x8316dc73, 0x120b63e3, 0x843b6494, 0x3e6a6d0d, 0xa85a6a7a,
        0x0bcf0ee4, 0x9dff0993, 0x27ae000a, 0xb19e077d, 0x44930ff0,
        0xd2a30887, 0x68f2011e, 0xfec20669, 0x5d5762f7, 0xcb676580,
        0x71366c19, 0xe7066b6e, 0x761bd4fe, 0xe02bd389, 0x5a7ada10,
        0xcc4add67, 0x6fdfb9f9, 0xf9efbe8e, 0x43beb717, 0xd58eb060,
        0xe8a3d6d6, 0x7e93d1a1, 0xc4c2d838, 0x52f2df4f, 0xf167bbd1,
        0x6757bca6, 0xdd06b53f, 0x4b36b248, 0xda2b0dd8, 0x4c1b0aaf,
        0xf64a0336, 0x607a0441, 0xc3ef60df, 0x55df67a8, 0xef8e6e31,
        0x79be6946, 0x8cb361cb, 0x1a8366bc, 0xa0d26f25, 0x36e26852,
        0x95770ccc, 0x03470bbb, 0xb9160222, 0x2f260555, 0xbe3bbac5,
        0x280bbdb2, 0x925ab42b, 0x046ab35c, 0xa7ffd7c2, 0x31cfd0b5,
        0x8b9ed92c, 0x1daede5b, 0xb0c2649b, 0x26f263ec, 0x9ca36a75,
        0x0a936d02, 0xa906099c, 0x3f360eeb, 0x85670772, 0x13570005,
        0x824abf95, 0x147ab8e2, 0xae2bb17b, 0x381bb60c, 0x9b8ed292,
        0x0dbed5e5, 0xb7efdc7c, 0x21dfdb0b, 0xd4d2d386, 0x42e2d4f1,
        0xf8b3dd68, 0x6e83da1f, 0xcd16be81, 0x5b26b9f6, 0xe177b06f,
        0x7747b718, 0xe65a0888, 0x706a0fff, 0xca3b0666, 0x5c0b0111,
        0xff9e658f, 0x69ae62f8, 0xd3ff6b61, 0x45cf6c16, 0x78e20aa0,
        0xeed20dd7, 0x5483044e, 0xc2b30339, 0x612667a7, 0xf71660d0,
        0x4d476949, 0xdb776e3e, 0x4a6ad1ae, 0xdc5ad6d9, 0x660bdf40,
        0xf03bd837, 0x53aebca9, 0xc59ebbde, 0x7fcfb247, 0xe9ffb530,
        0x1cf2bdbd, 0x8ac2baca, 0x3093b353, 0xa6a3b424, 0x0536d0ba,
        0x9306d7cd, 0x2957de54, 0xbf67d923, 0x2e7a66b3, 0xb84a61c4,
        0x021b685d, 0x942b6f2a, 0x37be0bb4, 0xa18e0cc3, 0x1bdf055a,
        0x8def022d
    ],
    [
        0x00000000, 0x41311b19, 0x82623632, 0xc3532d2b, 0x04c56c64,
        0x45f4777d, 0x86a75a56, 0xc796414f, 0x088ad9c8, 0x49bbc2d1,
        0x8ae8effa, 0xcbd9f4e3, 0x0c4fb5ac, 0x4d7eaeb5, 0x8e2d839e,
        0xcf1c9887, 0x5112c24a, 0x1023d953, 0xd370f478, 0x9241ef61,
        0x55d7ae2e, 0x14e6b537, 0xd7b5981c, 0x96848305, 0x59981b82,
        0x18a9009b, 0xdbfa2db0, 0x9acb36a9, 0x5d5d77e6, 0x1c6c6cff,
        0xdf3f41d4, 0x9e0e5acd, 0xa2248495, 0xe3159f8c, 0x2046b2a7,
        0x6177a9be, 0xa6e1e8f1, 0xe7d0f3e8, 0x2483dec3, 0x65b2c5da,
        0xaaae5d5d, 0xeb9f4644, 0x28cc6b6f, 0x69fd7076, 0xae6b3139,
        0xef5a2a20, 0x2c09070b, 0x6d381c12, 0xf33646df, 0xb2075dc6,
        0x715470ed, 0x30656bf4, 0xf7f32abb, 0xb6c231a2, 0x75911c89,
        0x34a00790, 0xfbbc9f17, 0xba8d840e, 0x79dea925, 0x38efb23c,
        0xff79f373, 0xbe48e86a, 0x7d1bc541, 0x3c2ade58, 0x054f79f0,
        0x447e62e9, 0x872d4fc2, 0xc61c54db, 0x018a1594, 0x40bb0e8d,
        0x83e823a6, 0xc2d938bf, 0x0dc5a038, 0x4cf4bb21, 0x8fa7960a,
        0xce968d13, 0x0900cc5c, 0x4831d745, 0x8b62fa6e, 0xca53e177,
        0x545dbbba, 0x156ca0a3, 0xd63f8d88, 0x970e9691, 0x5098d7de,
        0x11a9ccc7, 0xd2fae1ec, 0x93cbfaf5, 0x5cd76272, 0x1de6796b,
        0xdeb55440, 0x9f844f59, 0x58120e16, 0x1923150f, 0xda703824,
        0x9b41233d, 0xa76bfd65, 0xe65ae67c, 0x2509cb57, 0x6438d04e,
        0xa3ae9101, 0xe29f8a18, 0x21cca733, 0x60fdbc2a, 0xafe124ad,
        0xeed03fb4, 0x2d83129f, 0x6cb20986, 0xab2448c9, 0xea1553d0,
        0x29467efb, 0x687765e2, 0xf6793f2f, 0xb7482436, 0x741b091d,
        0x352a1204, 0xf2bc534b, 0xb38d4852, 0x70de6579, 0x31ef7e60,
        0xfef3e6e7, 0xbfc2fdfe, 0x7c91d0d5, 0x3da0cbcc, 0xfa368a83,
        0xbb07919a, 0x7854bcb1, 0x3965a7a8, 0x4b98833b, 0x0aa99822,
        0xc9fab509, 0x88cbae10, 0x4f5def5f, 0x0e6cf446, 0xcd3fd96d,
        0x8c0ec274, 0x43125af3, 0x022341ea, 0xc1706cc1, 0x804177d8,
        0x47d73697, 0x06e62d8e, 0xc5b500a5, 0x84841bbc, 0x1a8a4171,
        0x5bbb5a68, 0x98e87743, 0xd9d96c5a, 0x1e4f2d15, 0x5f7e360c,
        0x9c2d1b27, 0xdd1c003e, 0x120098b9, 0x533183a0, 0x9062ae8b,
        0xd153b592, 0x16c5f4dd, 0x57f4efc4, 0x94a7c2ef, 0xd596d9f6,
        0xe9bc07ae, 0xa88d1cb7, 0x6bde319c, 0x2aef2a85, 0xed796bca,
        0xac4870d3, 0x6f1b5df8, 0x2e2a46e1, 0xe136de66, 0xa007c57f,
        0x6354e854, 0x2265f34d, 0xe5f3b202, 0xa4c2a91b, 0x67918430,
        0x26a09f29, 0xb8aec5e4, 0xf99fdefd, 0x3accf3d6, 0x7bfde8cf,
        0xbc6ba980, 0xfd5ab299, 0x3e099fb2, 0x7f3884ab, 0xb0241c2c,
        0xf1150735, 0x32462a1e, 0x73773107, 0xb4e17048, 0xf5d06b51,
        0x3683467a, 0x77b25d63, 0x4ed7facb, 0x0fe6e1d2, 0xccb5ccf9,
        0x8d84d7e0, 0x4a1296af, 0x0b238db6, 0xc870a09d, 0x8941bb84,
        0x465d2303, 0x076c381a, 0xc43f1531, 0x850e0e28, 0x42984f67,
        0x03a9547e, 0xc0fa7955, 0x81cb624c, 0x1fc53881, 0x5ef42398,
        0x9da70eb3, 0xdc9615aa, 0x1b0054e5, 0x5a314ffc, 0x996262d7,
        0xd85379ce, 0x174fe149, 0x567efa50, 0x952dd77b, 0xd41ccc62,
        0x138a8d2d, 0x52bb9634, 0x91e8bb1f, 0xd0d9a006, 0xecf37e5e,
        0xadc26547, 0x6e91486c, 0x2fa05375, 0xe836123a, 0xa9070923,
        0x6a542408, 0x2b653f11, 0xe479a796, 0xa548bc8f, 0x661b91a4,
        0x272a8abd, 0xe0bccbf2, 0xa18dd0eb, 0x62defdc0, 0x23efe6d9,
        0xbde1bc14, 0xfcd0a70d, 0x3f838a26, 0x7eb2913f, 0xb924d070,
        0xf815cb69, 0x3b46e642, 0x7a77fd5b, 0xb56b65dc, 0xf45a7ec5,
        0x370953ee, 0x763848f7, 0xb1ae09b8, 0xf09f12a1, 0x33cc3f8a,
        0x72fd2493
    ],
    [
        0x00000000, 0x376ac201, 0x6ed48403, 0x59be4602, 0xdca80907,
        0xebc2cb06, 0xb27c8d04, 0x85164f05, 0xb851130e, 0x8f3bd10f,
        0xd685970d, 0xe1ef550c, 0x64f91a09, 0x5393d808, 0x0a2d9e0a,
        0x3d475c0b, 0x70a3261c, 0x47c9e41d, 0x1e77a21f, 0x291d601e,
        0xac0b2f1b, 0x9b61ed1a, 0xc2dfab18, 0xf5b56919, 0xc8f23512,
        0xff98f713, 0xa626b111, 0x914c7310, 0x145a3c15, 0x2330fe14,
        0x7a8eb816, 0x4de47a17, 0xe0464d38, 0xd72c8f39, 0x8e92c93b,
        0xb9f80b3a, 0x3cee443f, 0x0b84863e, 0x523ac03c, 0x6550023d,
        0x58175e36, 0x6f7d9c37, 0x36c3da35, 0x01a91834, 0x84bf5731,
        0xb3d59530, 0xea6bd332, 0xdd011133, 0x90e56b24, 0xa78fa925,
        0xfe31ef27, 0xc95b2d26, 0x4c4d6223, 0x7b27a022, 0x2299e620,
        0x15f32421, 0x28b4782a, 0x1fdeba2b, 0x4660fc29, 0x710a3e28,
        0xf41c712d, 0xc376b32c, 0x9ac8f52e, 0xada2372f, 0xc08d9a70,
        0xf7e75871, 0xae591e73, 0x9933dc72, 0x1c259377, 0x2b4f5176,
        0x72f11774, 0x459bd575, 0x78dc897e, 0x4fb64b7f, 0x16080d7d,
        0x2162cf7c, 0xa4748079, 0x931e4278, 0xcaa0047a, 0xfdcac67b,
        0xb02ebc6c, 0x87447e6d, 0xdefa386f, 0xe990fa6e, 0x6c86b56b,
        0x5bec776a, 0x02523168, 0x3538f369, 0x087faf62, 0x3f156d63,
        0x66ab2b61, 0x51c1e960, 0xd4d7a665, 0xe3bd6464, 0xba032266,
        0x8d69e067, 0x20cbd748, 0x17a11549, 0x4e1f534b, 0x7975914a,
        0xfc63de4f, 0xcb091c4e, 0x92b75a4c, 0xa5dd984d, 0x989ac446,
        0xaff00647, 0xf64e4045, 0xc1248244, 0x4432cd41, 0x73580f40,
        0x2ae64942, 0x1d8c8b43, 0x5068f154, 0x67023355, 0x3ebc7557,
        0x09d6b756, 0x8cc0f853, 0xbbaa3a52, 0xe2147c50, 0xd57ebe51,
        0xe839e25a, 0xdf53205b, 0x86ed6659, 0xb187a458, 0x3491eb5d,
        0x03fb295c, 0x5a456f5e, 0x6d2fad5f, 0x801b35e1, 0xb771f7e0,
        0xeecfb1e2, 0xd9a573e3, 0x5cb33ce6, 0x6bd9fee7, 0x3267b8e5,
        0x050d7ae4, 0x384a26ef, 0x0f20e4ee, 0x569ea2ec, 0x61f460ed,
        0xe4e22fe8, 0xd388ede9, 0x8a36abeb, 0xbd5c69ea, 0xf0b813fd,
        0xc7d2d1fc, 0x9e6c97fe, 0xa90655ff, 0x2c101afa, 0x1b7ad8fb,
        0x42c49ef9, 0x75ae5cf8, 0x48e900f3, 0x7f83c2f2, 0x263d84f0,
        0x115746f1, 0x944109f4, 0xa32bcbf5, 0xfa958df7, 0xcdff4ff6,
        0x605d78d9, 0x5737bad8, 0x0e89fcda, 0x39e33edb, 0xbcf571de,
        0x8b9fb3df, 0xd221f5dd, 0xe54b37dc, 0xd80c6bd7, 0xef66a9d6,
        0xb6d8efd4, 0x81b22dd5, 0x04a462d0, 0x33cea0d1, 0x6a70e6d3,
        0x5d1a24d2, 0x10fe5ec5, 0x27949cc4, 0x7e2adac6, 0x494018c7,
        0xcc5657c2, 0xfb3c95c3, 0xa282d3c1, 0x95e811c0, 0xa8af4dcb,
        0x9fc58fca, 0xc67bc9c8, 0xf1110bc9, 0x740744cc, 0x436d86cd,
        0x1ad3c0cf, 0x2db902ce, 0x4096af91, 0x77fc6d90, 0x2e422b92,
        0x1928e993, 0x9c3ea696, 0xab546497, 0xf2ea2295, 0xc580e094,
        0xf8c7bc9f, 0xcfad7e9e, 0x9613389c, 0xa179fa9d, 0x246fb598,
        0x13057799, 0x4abb319b, 0x7dd1f39a, 0x3035898d, 0x075f4b8c,
        0x5ee10d8e, 0x698bcf8f, 0xec9d808a, 0xdbf7428b, 0x82490489,
        0xb523c688, 0x88649a83, 0xbf0e5882, 0xe6b01e80, 0xd1dadc81,
        0x54cc9384, 0x63a65185, 0x3a181787, 0x0d72d586, 0xa0d0e2a9,
        0x97ba20a8, 0xce0466aa, 0xf96ea4ab, 0x7c78ebae, 0x4b1229af,
        0x12ac6fad, 0x25c6adac, 0x1881f1a7, 0x2feb33a6, 0x765575a4,
        0x413fb7a5, 0xc429f8a0, 0xf3433aa1, 0xaafd7ca3, 0x9d97bea2,
        0xd073c4b5, 0xe71906b4, 0xbea740b6, 0x89cd82b7, 0x0cdbcdb2,
        0x3bb10fb3, 0x620f49b1, 0x55658bb0, 0x6822d7bb, 0x5f4815ba,
        0x06f653b8, 0x319c91b9, 0xb48adebc, 0x83e01cbd, 0xda5e5abf,
        0xed3498be
    ],
    [
        0x00000000, 0x6567bcb8, 0x8bc809aa, 0xeeafb512, 0x5797628f,
        0x32f0de37, 0xdc5f6b25, 0xb938d79d, 0xef28b4c5, 0x8a4f087d,
        0x64e0bd6f, 0x018701d7, 0xb8bfd64a, 0xddd86af2, 0x3377dfe0,
        0x56106358, 0x9f571950, 0xfa30a5e8, 0x149f10fa, 0x71f8ac42,
        0xc8c07bdf, 0xada7c767, 0x43087275, 0x266fcecd, 0x707fad95,
        0x1518112d, 0xfbb7a43f, 0x9ed01887, 0x27e8cf1a, 0x428f73a2,
        0xac20c6b0, 0xc9477a08, 0x3eaf32a0, 0x5bc88e18, 0xb5673b0a,
        0xd00087b2, 0x6938502f, 0x0c5fec97, 0xe2f05985, 0x8797e53d,
        0xd1878665, 0xb4e03add, 0x5a4f8fcf, 0x3f283377, 0x8610e4ea,
        0xe3775852, 0x0dd8ed40, 0x68bf51f8, 0xa1f82bf0, 0xc49f9748,
        0x2a30225a, 0x4f579ee2, 0xf66f497f, 0x9308f5c7, 0x7da740d5,
        0x18c0fc6d, 0x4ed09f35, 0x2bb7238d, 0xc518969f, 0xa07f2a27,
        0x1947fdba, 0x7c204102, 0x928ff410, 0xf7e848a8, 0x3d58149b,
        0x583fa823, 0xb6901d31, 0xd3f7a189, 0x6acf7614, 0x0fa8caac,
        0xe1077fbe, 0x8460c306, 0xd270a05e, 0xb7171ce6, 0x59b8a9f4,
        0x3cdf154c, 0x85e7c2d1, 0xe0807e69, 0x0e2fcb7b, 0x6b4877c3,
        0xa20f0dcb, 0xc768b173, 0x29c70461, 0x4ca0b8d9, 0xf5986f44,
        0x90ffd3fc, 0x7e5066ee, 0x1b37da56, 0x4d27b90e, 0x284005b6,
        0xc6efb0a4, 0xa3880c1c, 0x1ab0db81, 0x7fd76739, 0x9178d22b,
        0xf41f6e93, 0x03f7263b, 0x66909a83, 0x883f2f91, 0xed589329,
        0x546044b4, 0x3107f80c, 0xdfa84d1e, 0xbacff1a6, 0xecdf92fe,
        0x89b82e46, 0x67179b54, 0x027027ec, 0xbb48f071, 0xde2f4cc9,
        0x3080f9db, 0x55e74563, 0x9ca03f6b, 0xf9c783d3, 0x176836c1,
        0x720f8a79, 0xcb375de4, 0xae50e15c, 0x40ff544e, 0x2598e8f6,
        0x73888bae, 0x16ef3716, 0xf8408204, 0x9d273ebc, 0x241fe921,
        0x41785599, 0xafd7e08b, 0xcab05c33, 0x3bb659ed, 0x5ed1e555,
        0xb07e5047, 0xd519ecff, 0x6c213b62, 0x094687da, 0xe7e932c8,
        0x828e8e70, 0xd49eed28, 0xb1f95190, 0x5f56e482, 0x3a31583a,
        0x83098fa7, 0xe66e331f, 0x08c1860d, 0x6da63ab5, 0xa4e140bd,
        0xc186fc05, 0x2f294917, 0x4a4ef5af, 0xf3762232, 0x96119e8a,
        0x78be2b98, 0x1dd99720, 0x4bc9f478, 0x2eae48c0, 0xc001fdd2,
        0xa566416a, 0x1c5e96f7, 0x79392a4f, 0x97969f5d, 0xf2f123e5,
        0x05196b4d, 0x607ed7f5, 0x8ed162e7, 0xebb6de5f, 0x528e09c2,
        0x37e9b57a, 0xd9460068, 0xbc21bcd0, 0xea31df88, 0x8f566330,
        0x61f9d622, 0x049e6a9a, 0xbda6bd07, 0xd8c101bf, 0x366eb4ad,
        0x53090815, 0x9a4e721d, 0xff29cea5, 0x11867bb7, 0x74e1c70f,
        0xcdd91092, 0xa8beac2a, 0x46111938, 0x2376a580, 0x7566c6d8,
        0x10017a60, 0xfeaecf72, 0x9bc973ca, 0x22f1a457, 0x479618ef,
        0xa939adfd, 0xcc5e1145, 0x06ee4d76, 0x6389f1ce, 0x8d2644dc,
        0xe841f864, 0x51792ff9, 0x341e9341, 0xdab12653, 0xbfd69aeb,
        0xe9c6f9b3, 0x8ca1450b, 0x620ef019, 0x07694ca1, 0xbe519b3c,
        0xdb362784, 0x35999296, 0x50fe2e2e, 0x99b95426, 0xfcdee89e,
        0x12715d8c, 0x7716e134, 0xce2e36a9, 0xab498a11, 0x45e63f03,
        0x208183bb, 0x7691e0e3, 0x13f65c5b, 0xfd59e949, 0x983e55f1,
        0x2106826c, 0x44613ed4, 0xaace8bc6, 0xcfa9377e, 0x38417fd6,
        0x5d26c36e, 0xb389767c, 0xd6eecac4, 0x6fd61d59, 0x0ab1a1e1,
        0xe41e14f3, 0x8179a84b, 0xd769cb13, 0xb20e77ab, 0x5ca1c2b9,
        0x39c67e01, 0x80fea99c, 0xe5991524, 0x0b36a036, 0x6e511c8e,
        0xa7166686, 0xc271da3e, 0x2cde6f2c, 0x49b9d394, 0xf0810409,
        0x95e6b8b1, 0x7b490da3, 0x1e2eb11b, 0x483ed243, 0x2d596efb,
        0xc3f6dbe9, 0xa6916751, 0x1fa9b0cc, 0x7ace0c74, 0x9461b966,
        0xf10605de
    ]
].map(arr => new Uint32Array(arr));

/**
 * crc32 -- compute the CRC32 checksum of a data stream
 * Copyright (C) 1995-2006, 2010, 2011, 2012, 2016 Mark Adler
 * Converted to TypeScript by Arthur Langereis (@zenmumbler)
 * from crc32.c/h, which can be found at:
 * https://github.com/madler/zlib/blob/v1.2.11/crc32.c
 */
const swap32 = (q) => ((((q) >>> 24) & 0xff) + (((q) >>> 8) & 0xff00) +
    (((q) & 0xff00) << 8) + (((q) & 0xff) << 24)) >>> 0;
/* =========================================================================
#define DOLIT4 c ^= *buf4++; \
                c = crcTables[3][c & 0xff] ^ crcTables[2][(c >>> 8) & 0xff] ^ \
                        crcTables[1][(c >>> 16) & 0xff] ^ crcTables[0][c >>> 24]
#define DOLIT32 DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4; DOLIT4

========================================================================= */
function crc32BytesLittle(buf, crc = 0) {
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
function crc32BytesBig(buf, crc = 0) {
    let c = swap32(crc);
    c = ~c;
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
// Inflater
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

export { Inflater, adler32, adler32Bytes, adler32Combine, crc32BytesLittle, crc32BytesBig };
