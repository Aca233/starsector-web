import { control as beforeOnePass } from './one-pass-candidate.mjs';
import { previousPreflight } from './scanner-preflight-reference.mjs';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const namespace = 'scanner-reference';
const files = new Set(['src/network/BinarySnapshot.mjs', 'src/network/SnapshotMotionReference.mjs', 'src/network/LanBinaryDelta.mjs', 'server/LanDeltaTransport.mjs']);
function replaceOnce(source, from, to = '') {
  if (source.split(from).length !== 2) throw Error('Missing unique scanner reference marker: ' + from);
  return source.replace(from, to);
}
export const scannerCodecPlugin = { name: namespace, setup(build) {
  build.onResolve({ filter: /^scanner-reference\// }, args => ({ path: path.resolve(args.path.slice(namespace.length + 1)), namespace }));
  build.onResolve({ filter: /^\./, namespace }, args => {
    const absolute = path.resolve(args.resolveDir, args.path), relative = path.relative(root, absolute).replaceAll('\\', '/');
    return { path: absolute, ...(files.has(relative) ? { namespace } : {}) };
  });
  build.onLoad({ filter: /.*/, namespace }, args => {
    let source = fs.readFileSync(args.path, 'utf8');
    if (args.path.endsWith('BinarySnapshot.mjs')) source = beforeOnePass(source);
    if (args.path.endsWith('LanBinaryDelta.mjs')) { source = replaceOnce(source, 'k = 1; k < 8; k++', 'k = 1; k < 4; k++'); source = replaceOnce(source, "  if (bytes.length >= 8) {\n    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);\n    const [t0, t1, t2, t3, t4, t5, t6, t7] = crcTables;\n    for (; i + 8 <= bytes.length; i += 8) {\n      const a = crc ^ view.getUint32(i, true), b = view.getUint32(i + 4, true);\n      crc = t7[a & 255] ^ t6[a >>> 8 & 255] ^ t5[a >>> 16 & 255] ^ t4[a >>> 24]\n        ^ t3[b & 255] ^ t2[b >>> 8 & 255] ^ t1[b >>> 16 & 255] ^ t0[b >>> 24];\n    }\n  }\n"); }
    if (args.path.endsWith('BinarySnapshot.mjs') || args.path.endsWith('SnapshotMotionReference.mjs')) source = replaceOnce(source, "import { FIXED_TAG_BYTES } from './BinaryTagWidths.mjs';\n");
    if (args.path.endsWith('BinarySnapshot.mjs')) source = replaceOnce(source, "      const at = this.offset, tag = this.bytes[at];\n      let key;\n      // preflight already validated the bytes. Dictionary uint keys need no\n      // generic value dispatch, but still pass dictionary/range/denylist checks.\n      if (this.dictionary && (tag < 128 || tag === 0xcc || tag === 0xcd)) {\n        if (tag < 128) { key = tag; this.offset = at + 1; }\n        else if (tag === 0xcc) { key = this.bytes[at + 1]; this.offset = at + 2; }\n        else { key = this.view.getUint16(at + 1); this.offset = at + 3; }\n      } else key = this.read();","      let key = this.read();");
    if (args.path.endsWith('BinarySnapshot.mjs')) source = replaceOnce(source, "      else if (tag === 0xc2 || tag === 0xc3) { result[i] = tag === 0xc3; this.offset = at + 1; }\n      else if (tag === 0xcc) { result[i] = bytes[at + 1]; this.offset = at + 2; }\n      else if (tag === 0xcd) { result[i] = view.getUint16(at + 1); this.offset = at + 3; }\n      else if (tag === 0xce) { result[i] = view.getUint32(at + 1); this.offset = at + 5; }\n");
    if (args.path.endsWith('BinarySnapshot.mjs')) source = source.slice(0,source.indexOf('function preflight(bytes) {')) + previousPreflight + source.slice(source.indexOf('\n/** Null requests'));
    if (args.path.endsWith('SnapshotMotionReference.mjs')) {
      source = replaceOnce(source, "new MotionRow('projectiles', template.common, template.commonKeys)","new MotionRow('projectiles', template.common)");
      source = replaceOnce(source, "templates.push({ common, commonKeys: Object.keys(common), keys:","templates.push({ common, keys:");
      source = replaceOnce(source, "if (common) for (const key of commonKeys) this[key] = common[key];","if (common) for (const key of Object.keys(common)) this[key] = common[key];");
      source = replaceOnce(source, "constructor(kind, common, commonKeys) {","constructor(kind, common) {");
      source = replaceOnce(source, "    if (arrayTag(tag) || mapTag(tag)) {\n      const map = mapTag(tag), count = this.count(map ? 'map' : 'array', depth);\n      for (let i = 0; i < count; i++) {\n        if (map) this.key(); // Never skip validation of a map key.\n        const width = FIXED_TAG_BYTES[this.bytes[this.at]];\n        if (width) {\n          // Inline leaf traversal, preserving the original one visit per value.\n          this.visit(depth + 1);\n          if (width > this.bytes.length - this.at) invalid();\n          this.at += width;\n        } else this.skip(depth + 1);\n      }\n      return;\n    }","    if (arrayTag(tag)) { const count = this.count('array', depth); for (let i = 0; i < count; i++) this.skip(depth + 1); return; }\r\n    if (mapTag(tag)) { const count = this.count('map', depth); for (let i = 0; i < count; i++) { this.key(); this.skip(depth + 1); } return; }");
      source = replaceOnce(source, "  number() { const span = this.scalar(); if (typeof span.value !== 'number') invalid(); return span; }","  number() { const { value, offset } = this.scalar(); if (typeof value !== 'number') invalid(); return { value, offset }; }");
      source = replaceOnce(source, "// Parser-private, stable-shaped spans. These are never exposed as game state.\nclass MotionRow {\n  kind; pos; prevPos; vel; life; maxLife; rotation; angularVel; material; alpha;\n  elapsedTime; flightTimeRemaining; armingTimeRemaining; sourceMoveSpeed; rangeRemaining; didDamage;\n  constructor(kind, common) {\n    this.kind = kind;\n    if (common) for (const key of Object.keys(common)) this[key] = common[key];\n  }\n}\n\n");
      source = replaceOnce(source, 'const row = new MotionRow(kind);', 'const row = { kind };');
      source = replaceOnce(source, "row = new MotionRow('projectiles', template.common);", "row = { ...template.common, kind: 'projectiles' };");
      source = replaceOnce(source, "  vector() {\n    // The wire contract is exactly one $vector member and two numeric spans.\n    // Keep the same visits/bounds, without two per-vector callback closures,\n    // a one-key Set, and a push-grown array.\n    if (this.count('map') !== 1 || this.key() !== '$vector' || this.count('array') !== 2) invalid();\n    return [this.number(), this.number()];\n  }","  vector() {\r\n    let result;\r\n    if (this.map(key => {\r\n      if (key !== '$vector') return invalid(); result = [];\r\n      if (this.array(() => result.push(this.number()), 2) !== 2) invalid();\r\n    }) !== 1 || !result) invalid();\r\n    return result;\r\n  }");
      source = replaceOnce(source, "    if (tag === 0xcb) {\n      this.guard(8); const value = this.view.getFloat64(this.at); this.at += 8;\n      if (!Number.isFinite(value)) invalid();\n      return { value, offset: start + 1 };\n    }\n");
      source = replaceOnce(source, `\n    const fixedWidth = FIXED_TAG_BYTES[tag];\n    if (fixedWidth) { if (fixedWidth > this.bytes.length - this.at) invalid(); this.at += fixedWidth; return; }`);
      source = replaceOnce(source, `// Dictionary keys overwhelmingly use uint tags. Avoid boxing a scalar span
    // which is immediately discarded; retain the same node and bounds checks.
    const tag = this.bytes[this.at];
    let key;
    if (tag < 0x80 || tag === 0xcc || tag === 0xcd) {
      this.visit(); this.byte(); key = tag < 0x80 ? tag : this.unsigned(tag === 0xcc ? 1 : 2);
    } else key = this.scalar().value;`, 'const key = this.scalar().value;');
    }
    return { contents: source, loader: 'js', resolveDir: path.dirname(args.path) };
  });
} };
