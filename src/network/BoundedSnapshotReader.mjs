
/** A single-pass value reader using the established string decoder. Factories
 * bind private codec policy once, never create classes per packet. The caller
 * retains its legacy parser for error ordering/short-UTF8 compatibility. */
export function boundedSnapshotReader(BaseReader, dictionaryKey, byteLimit, maxDepth) {
  // SWF2's immutable key ABI is checked once; this never interprets numeric
  // VALUES as keys, nor accepts an unchecked arbitrary marker from the wire.
  const tags = dictionaryKey(0) === '$undefined' && dictionaryKey(1) === '$vector'
    && dictionaryKey(2) === '$record' && dictionaryKey(3) === 'values';
  return class BoundedSnapshotReader extends BaseReader {
    level = 0;
    slots = 0;
    constructor(bytes, dictionary, packed = false) {
      super(bytes, dictionary, packed);
      if (!bytes.length || bytes.length > byteLimit) throw new RangeError('Binary snapshot exceeds budget');
    }
    complete() {
      const value = this.read();
      if (this.offset !== this.bytes.length) throw Error('Trailing binary snapshot data');
      return value;
    }
    guard(width) {
      if (width > this.bytes.length - this.offset) throw Error('Truncated binary snapshot');
    }
    string(length) {
      this.guard(length);
      return super.string(length);
    }
    container(length, map) {
      const count = map ? length * 2 : length;
      // Every slot needs at least one encoded byte. Counting ALL declared
      // child slots prevents overlapping nested claims from amplifying memory.
      if ((map && length > 65536) || count > this.bytes.length - this.offset
          || (count && this.level + 1 >= maxDepth)
          || (this.slots += count) > this.bytes.length) throw Error('Invalid binary snapshot container');
      this.level++;
    }
    array(length) {
      this.container(length, false);
      // Never allocate an attacker-declared huge length up front. Large arrays
      // grow only after successful parsing. Speculative small-array storage is
      // bounded by maxDepth * 256 regardless of advertised nested lengths.
      const out = length <= 256 ? new Array(length) : [];
      const bytes = this.bytes, view = this.view;
      for (let i = 0; i < length; i++) {
        const at = this.offset, tag = bytes[at];
        if (tag < 128) { out[i] = tag; this.offset = at + 1; }
        else if (tag >= 224) { out[i] = tag - 256; this.offset = at + 1; }
        else if (tag === 0xcb) { out[i] = view.getFloat64(at + 1); this.offset = at + 9; }
        else if (tag === 0xc0) { out[i] = null; this.offset = at + 1; }
        else if (tag === 0xc2 || tag === 0xc3) { out[i] = tag === 0xc3; this.offset = at + 1; }
        else if (tag === 0xcc) { if (at + 1 >= bytes.length) throw Error('Truncated binary snapshot'); out[i] = bytes[at + 1]; this.offset = at + 2; }
        else if (tag === 0xcd) { out[i] = view.getUint16(at + 1); this.offset = at + 3; }
        else if (tag === 0xce) { out[i] = view.getUint32(at + 1); this.offset = at + 5; }
        else out[i] = this.read();
      }
      this.level--; return out;
    }
    map(length) {
      this.container(length, true);
      const out = {};
      for (let i = 0; i < length; i++) {
        const at = this.offset, tag = this.bytes[at]; let key;
        if (this.dictionary && (tag < 128 || tag === 0xcc || tag === 0xcd)) {
          this.guard(tag < 128 ? 1 : tag === 0xcc ? 2 : 3);
          if (tag < 128) { key = tag; this.offset = at + 1; }
          else if (tag === 0xcc) { key = this.bytes[at + 1]; this.offset = at + 2; }
          else { key = this.view.getUint16(at + 1); this.offset = at + 3; }
        } else key = this.read();
        if (this.dictionary && typeof key === 'number') key = dictionaryKey(key);
        if (typeof key !== 'string' || key === '__proto__' || key === 'prototype' || key === 'constructor') throw Error('Invalid binary snapshot key');
        out[key] = this.read();
      }
      this.level--; return out;
    }
    read() {
      // DataView getters perform their own exact native bounds check. Do not
      // repeat it in JavaScript for every number. Uint8 byte reads need an
      // explicit check; missing tags fail dispatch and cannot return a value.
      const start = this.offset, tag = this.bytes[start];
      this.offset = start + 1;
      const view = this.view, p = this.offset;
      if (tag < 128) return tag;
      if (tag >= 224) return tag - 256;
      if (tag >= 160 && tag < 192) return this.string(tag & 31);
      if (tag >= 144 && tag < 160) return this.array(tag & 15);
      if (tag >= 128 && tag < 144) {
        const bytes = this.bytes;
        if (this.dictionary && tags) {
          if (tag === 0x81 && bytes[start + 1] === 0 && bytes[start + 2] === 1) {
            this.container(1, true); this.level--; this.offset = start + 3;
            return { $undefined: 1 };
          }
          if (tag === 0x81 && bytes[start + 1] === 1 && bytes[start + 2] === 0x92
              && bytes[start + 3] === 0xcb && bytes[start + 12] === 0xcb) {
            this.container(1, true); this.offset = start + 3; this.container(2, false);
            // Both DataView reads are bounded. No object or vector aliases the packet.
            const x = view.getFloat64(start + 4), y = view.getFloat64(start + 13);
            this.level -= 2; this.offset = start + 21;
            return { $vector: [x, y] };
          }
          if (tag === 0x82 && bytes[start + 1] === 2 && bytes[start + 2] < 128 && bytes[start + 3] === 3) {
            this.container(2, true); this.offset = start + 4;
            const values = this.read(); this.level--;
            return { $record: bytes[start + 2], values };
          }
        }
        return this.map(tag & 15);
      }
      switch (tag) {
        case 0xc4: this.guard(1); this.offset++; return this.binary(this.bytes[p]);
        case 0xc5: this.offset += 2; return this.binary(view.getUint16(p));
        case 0xc6: this.offset += 4; return this.binary(view.getUint32(p));
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xcc: this.guard(1); this.offset++; return this.bytes[p];
        case 0xd0: this.offset++; return view.getInt8(p);
        case 0xcd: this.offset += 2; return view.getUint16(p);
        case 0xd1: this.offset += 2; return view.getInt16(p);
        case 0xce: this.offset += 4; return view.getUint32(p);
        case 0xd2: this.offset += 4; return view.getInt32(p);
        case 0xca: this.offset += 4; return view.getFloat32(p);
        case 0xcb: this.offset += 8; return view.getFloat64(p);
        case 0xcf: this.offset += 8; return view.getUint32(p) * 4294967296 + view.getUint32(p + 4);
        case 0xd3: this.offset += 8; return view.getInt32(p) * 4294967296 + view.getUint32(p + 4);
        case 0xd9: this.guard(1); this.offset++; return this.string(this.bytes[p]);
        case 0xda: this.offset += 2; return this.string(view.getUint16(p));
        case 0xdb: this.offset += 4; return this.string(view.getUint32(p));
        case 0xdc: this.offset += 2; return this.array(view.getUint16(p));
        case 0xdd: this.offset += 4; return this.array(view.getUint32(p));
        case 0xde: this.offset += 2; return this.map(view.getUint16(p));
        case 0xdf: this.offset += 4; return this.map(view.getUint32(p));
        default: throw Error('Unsupported binary snapshot tag');
      }
    }
  };
}
