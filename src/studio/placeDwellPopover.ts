export type HoverRect = { left: number; top: number; right: number; bottom: number };
type Placement = { width: number; height: number; anchor: HoverRect; viewport: HoverRect; cards: HoverRect[]; reading: HoverRect[]; headers: HoverRect[] };
const overlap = (a: HoverRect, b: HoverRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Try the gaps around the whole ancestor chain; never move an already locked card. */
export function placeDwellPopover({ width, height, anchor, viewport, cards, reading, headers }: Placement) {
  const gap = 5, parent = cards.at(-1) ?? anchor;
  const clampX = (x: number) => Math.max(viewport.left, Math.min(Math.round(x), viewport.right - width));
  const clampY = (y: number) => Math.max(viewport.top, Math.min(Math.round(y), viewport.bottom - height));
  const xs = new Set([clampX(parent.right + gap), clampX(parent.left - width - gap), viewport.left, clampX(viewport.right - width)]);
  const ys = new Set([clampY(anchor.top), clampY(anchor.bottom - height), viewport.top, clampY(viewport.bottom - height)]);
  for (const r of [anchor, ...cards, ...reading, ...headers]) {
    for (const x of [r.left - width - gap, r.right + gap, r.left, r.right - width]) xs.add(clampX(x));
    for (const y of [r.top - height - gap, r.bottom + gap, r.top, r.bottom - height]) ys.add(clampY(y));
  }
  let best = { x: clampX(parent.right + gap), y: clampY(anchor.top) }, score: number[] | undefined;
  for (const x of xs) for (const y of ys) {
    const rect = { left: x, top: y, right: x + width, bottom: y + height };
    const dx = Math.max(0, anchor.left - rect.right, rect.left - anchor.right);
    const dy = Math.max(0, anchor.top - rect.bottom, rect.top - anchor.bottom);
    // Source lines and close controls take priority when a small screen forces overlap.
    const next = [overlap(rect, anchor), reading.reduce((n, r) => n + overlap(rect, r), 0),
      headers.reduce((n, r) => n + overlap(rect, r), 0),
      // Keep the reader reachable: after protecting the source/reading lines, prefer a nearby
      // partial overlap over sending a child to the far edge merely to avoid all ancestor pixels.
      Math.max(0, Math.hypot(dx, dy) - 24), cards.reduce((n, r) => n + overlap(rect, r), 0),
      dx * dx + dy * dy, Math.abs(y - anchor.top), Math.abs(x - (parent.right + gap))];
    const firstDifference = score ? next.findIndex((value, i) => Math.abs(value - score![i]) > .1) : 0;
    if (!score || (firstDifference >= 0 && next[firstDifference] < score[firstDifference])) { best = { x, y }; score = next; }
  }
  return best;
}
