/** Total encoded byte width for fixed-width JSON MessagePack scalars/strings.
 * Zero means a container, variable-width string or unsupported tag: callers
 * MUST keep their full validation path. This does not authorize skipping keys. */
const widths = new Array(256).fill(0);
for (let tag = 0; tag < 128; tag++) widths[tag] = 1;
for (let tag = 224; tag < 256; tag++) widths[tag] = 1;
for (let tag = 160; tag < 192; tag++) widths[tag] = 1 + (tag & 31);
for (const tag of [0xc0, 0xc2, 0xc3]) widths[tag] = 1;
for (const tag of [0xcc, 0xd0]) widths[tag] = 2;
for (const tag of [0xcd, 0xd1]) widths[tag] = 3;
for (const tag of [0xca, 0xce, 0xd2]) widths[tag] = 5;
for (const tag of [0xcb, 0xcf, 0xd3]) widths[tag] = 9;
export const FIXED_TAG_BYTES = Object.freeze(widths);
