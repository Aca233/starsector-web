// EXPERIMENT ONLY: not negotiated or imported by the game/relay. Do not send
// SWP1 to existing LAN peers. This is a byte-layout transform, not compression.
// Run AFTER the existing SWF2 encoder and BEFORE the existing transport deflate.
// No JSON traversal, key reinterpretation, quantization, or Node dependencies.
import protocol from '../protocol.json' with { type: 'json' };

const LIMIT = protocol.maxSnapshotBytes, DEPTH = 128, HEADER = 12;
const SWF2 = 0x53574632, SWP1 = 0x53575031;
const invalid = () => { throw new Error('Invalid experimental LAN float-plane frame'); };
function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return invalid();
}
function viewOf(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

// Structural preflight BEFORE allocating restored output. Bounds match SWF2's
// 16 MiB / depth 128 / 65536 map entries, NOT Steam's smaller state limits.
// A compact skeleton retains every tag but omits cb's eight payload bytes.
// Dictionary integer keys and legacy string semantics are deliberately untouched:
// decodeBinaryFrame remains responsible for semantic validation after restoration.
// No per-node/float offset array is retained; traversal stack is bounded by depth.
function scan(bytes, compact, visit) {
  if (bytes.length < 5 || bytes.length > LIMIT || viewOf(bytes).getUint32(0) !== SWF2) invalid();
  const view = viewOf(bytes), stack = [1];
  let at = 4, pending = 1, floats = 0;
  const need = n => { if (n > bytes.length - at) invalid(); };
  const length = width => {
    need(width);
    const n = width === 1 ? bytes[at] : width === 2 ? view.getUint16(at) : view.getUint32(at);
    at += width; return n;
  };
  while (stack.length) {
    if (stack[stack.length - 1] === 0) { stack.pop(); continue; }
    stack[stack.length - 1]--; pending--;
    need(1); const tag = bytes[at++];
    let count = 0, skip = 0, map = false;
    if (tag <= 0x7f || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) continue;
    if (tag >= 0xa0 && tag <= 0xbf) skip = tag & 31;
    else if (tag >= 0x90 && tag <= 0x9f) count = tag & 15;
    else if (tag >= 0x80 && tag <= 0x8f) { count = (tag & 15) * 2; map = true; }
    else switch (tag) {
      case 0xcc: case 0xd0: skip = 1; break;
      case 0xcd: case 0xd1: skip = 2; break;
      case 0xca: case 0xce: case 0xd2: skip = 4; break;
      case 0xcb:
        if (!compact) need(8);
        if (visit) visit(at, floats);
        floats++; skip = compact ? 0 : 8; break;
      case 0xcf: case 0xd3: skip = 8; break;
      case 0xd9: skip = length(1); break;
      case 0xda: skip = length(2); break;
      case 0xdb: skip = length(4); break;
      case 0xdc: count = length(2); break;
      case 0xdd: count = length(4); break;
      case 0xde: count = length(2) * 2; map = true; break;
      case 0xdf: count = length(4) * 2; map = true; break;
      default: invalid();
    }
    need(skip); at += skip;
    if (count) {
      pending += count;
      if ((map && count > 131072) || pending > bytes.length - at || stack.length >= DEPTH) invalid();
      stack.push(count);
    }
  }
  if (at !== bytes.length) invalid();
  return floats;
}

/** Owned SWP1 bytes, or null to keep the ORIGINAL SWF2 bytes (never JSON).
 * Layout: magic, LE skeleton length, LE float count, SWF2 skeleton, eight planes.
 * Applying this to a shared/mutable buffer requires the caller to own it first. */
export function shuffleLanFrame(buffer) {
  const input = bytesOf(buffer), count = scan(input, false);
  if (count < 2 || input.length + HEADER > LIMIT) return null;
  const size = input.length - count * 8, output = new Uint8Array(input.length + HEADER);
  const header = viewOf(output), planes = HEADER + size;
  header.setUint32(0, SWP1); header.setUint32(4, size, true); header.setUint32(8, count, true);
  let source = 0, target = HEADER;
  scan(input, false, (p, i) => {
    output.set(input.subarray(source, p), target); target += p - source; source = p + 8;
    for (let plane = 0; plane < 8; plane++) output[planes + plane * count + i] = input[p + plane];
  });
  output.set(input.subarray(source), target);
  return output;
}

/** Restore exact original SWF2 bytes; then use the existing decodeBinaryFrame.
 * Structural/length preflight precedes the bounded allocation. Invalid key names,
 * UTF-8 etc. still take the unchanged LAN decoder path, not Steam's validator. */
export function unshuffleLanFrame(buffer) {
  const input = bytesOf(buffer);
  if (input.length < HEADER + 5 || input.length > LIMIT) invalid();
  const header = viewOf(input), size = header.getUint32(4, true), count = header.getUint32(8, true);
  if (header.getUint32(0) !== SWP1 || size < 5 || count < 2 || HEADER + size + count * 8 !== input.length) invalid();
  const skeleton = input.subarray(HEADER, HEADER + size);
  if (scan(skeleton, true) !== count) invalid();
  const output = new Uint8Array(size + count * 8), planes = HEADER + size;
  let source = 0, target = 0;
  scan(skeleton, true, (p, i) => {
    output.set(skeleton.subarray(source, p), target); target += p - source; source = p;
    for (let plane = 0; plane < 8; plane++) output[target + plane] = input[planes + plane * count + i];
    target += 8;
  });
  output.set(skeleton.subarray(source), target);
  return output;
}
