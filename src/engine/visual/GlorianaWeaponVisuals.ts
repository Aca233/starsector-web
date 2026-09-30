import art from '../content/gloriana-armory-art.json';

export interface WeaponArtRect { x: number; y: number; width: number; height: number }
interface ArtLayout { width: number; height: number; scale: number; pivot: number[]; crop: {left:number;top:number;width:number;height:number} }
export interface RecoilWindowProfile { width: number; height: number; travel: number; fixed: WeaponArtRect[]; barrels: WeaponArtRect[] }
/** Same resampling/padding transform as prepare-gloriana-armory; never repaint the approved PNG. */
function sourceRect(a: ArtLayout, x: number, y: number, width: number, height: number): WeaponArtRect {
  const w = Math.round(a.crop.width * a.scale), h = Math.round(a.crop.height * a.scale);
  const sx = w / a.crop.width, sy = h / a.crop.height;
  const padX = a.width / 2 - Math.round((a.pivot[0] - a.crop.left) * sx);
  const padY = a.height / 2 - Math.round((a.pivot[1] - a.crop.top) * sy);
  const left = Math.round(padX + (x - a.crop.left) * sx), top = Math.round(padY + (y - a.crop.top) * sy);
  return {x: left, y: top, width: Math.round(padX + (x + width - a.crop.left) * sx) - left,
    height: Math.round(padY + (y + height - a.crop.top) * sy) - top};
}
function subtract(a: WeaponArtRect, b: WeaponArtRect): WeaponArtRect[] {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return [a];
  return [
    {x:a.x,y:a.y,width:a.width,height:y-a.y},
    {x:a.x,y:bottom,width:a.width,height:a.y+a.height-bottom},
    {x:a.x,y,width:x-a.x,height:bottom-y},
    {x:right,y,width:a.x+a.width-right,height:bottom-y},
  ].filter(r => r.width > 0 && r.height > 0);
}
function profile(a: ArtLayout, travel: number, regions: number[][]): RecoilWindowProfile {
  const barrels = regions.map(([x,y,w,h]) => sourceRect(a,x,y,w,h));
  let fixed: WeaponArtRect[] = [{x:0,y:0,width:a.width,height:a.height}];
  for (const rect of barrels) fixed = fixed.flatMap(r => subtract(r,rect));
  return {width:a.width,height:a.height,travel,fixed,barrels};
}
/** Only the exposed tubes telescope into the stationary lower receiver; not a fake whole-turret kick. */
export const glorianaRecoilProfiles: Readonly<Record<string, RecoilWindowProfile>> = {
  web_gloriana_macro: profile(art.macro, 4, [[255,21,74,311],[360,21,72,311]]),
  web_gloriana_siege: profile(art.siege, 2.2, [[290,669,99,205]]),
};
export interface ChargeCell extends WeaponArtRect { threshold: number }
export const glorianaChargeCells: Readonly<Record<string, readonly ChargeCell[]>> = {
  // Ordered aft-to-fore, inside the existing amber energy chambers, not over the gilding.
  web_gloriana_lance: [390,346,302,258,214,170].map((y,i) => ({...sourceRect(art.lance,942,y,16,26),threshold:i/7})),
  web_gloriana_interceptor: [460,410,359,309].map((y,i) => ({...sourceRect(art.interceptor,1274,y,25,30),threshold:i/6})),
};
export function chargeCellLevel(charge: number, threshold: number): number {
  return Math.max(0, Math.min(1, (charge - threshold) / Math.max(.001, 1 - threshold)));
}
/** Clip a retracting tube at its receiver; the hidden end is never invented or stretched. */
export function recoilSlice(rect: WeaponArtRect, recoil: number, travel: number) {
  const shift = Math.min(rect.height, Math.max(0, Math.min(1, recoil)) * travel);
  return {source:{...rect,height:rect.height-shift}, destination:{...rect,y:rect.y+shift,height:rect.height-shift}};
}
export function glorianaArtSize(id: string): {width:number;height:number} | undefined {
  if (id === 'web_gloriana_lance') return art.lance;
  if (id === 'web_gloriana_interceptor') return art.interceptor;
}
