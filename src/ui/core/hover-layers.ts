/** Lightweight hover layers share Escape priority with modals, without becoming modals. */
type HoverLayer = { id: string; owner: string; depth: number; visible: () => boolean; locked: () => boolean; hide: () => void; dismiss: () => void };
const layers = new Map<string, HoverLayer>();
export function dismissTopHover() {
  const top = [...layers.values()].reverse().find(layer => layer.visible());
  if (!top) return false;
  top.dismiss();
  return true;
}
function escape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
  if (dismissTopHover()) { event.preventDefault(); event.stopImmediatePropagation(); }
}
export function hoverLockedElsewhere(owner: string) {
  return [...layers.values()].some(layer => layer.owner !== owner && layer.visible() && layer.locked());
}
export function announceHover(owner: string, depth: number, id: string) {
  for (const layer of [...layers.values()]) {
    if (layer.id !== id && (layer.owner !== owner || layer.depth >= depth)) layer.hide();
  }
}
export function registerHover(layer: HoverLayer) {
  if (!layers.size) window.addEventListener('keydown', escape, true);
  layers.set(layer.id, layer);
  return () => {
    layers.delete(layer.id);
    if (!layers.size) window.removeEventListener('keydown', escape, true);
  };
}