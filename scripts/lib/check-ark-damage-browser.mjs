import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

/** Controlled damage from the production simulation, rendered by the same live
 * WebGL pass. This does not mutate the paused Worker or the user's saved ship. */
export async function checkArkDamage(page, out) {
 const report = await page.evaluate(async () => {
  const { CombatEngine } = await import('/src/engine/simulation/CombatEngine.ts');
  const { combatRenderView } = await import('/src/engine/render/CombatRenderView.ts');
  const { arkArt, arkFrame } = await import('/src/engine/visual/AdunArkArt.ts');
  const { arkOwner, ADUN_ARK_ART } = await import('/src/engine/content/AdunArkIds.ts');
  const { textureCache } = await import('/src/engine/render/TextureCache.ts');
  const { renderArkDamageOverlayCanvas } = await import('/src/engine/render/ArkDamageOverlay.ts');
  const { renderShipDamageOverlayCanvas, damageDecalUrl } = await import('/src/engine/render/ShipDamageVisuals.ts');
  const { ArkDamageRenderer } = await import('/src/engine/render/webgl/ArkDamageRenderer.ts');
  const { arkLanceArt } = await import('/src/engine/visual/ArkLanceMotion.ts');
  const session = window.__combatSession, renderer = window.__combatRenderer;
  const e = new CombatEngine(session.renderView.playerShip.spec.id, 'web_sc2_hyperion', 260928);
  const root = e.playerShip;
  root.pos.set(0, 0); root.prevPos.copy(root.pos); root.facingRad = root.prevFacingRad = -Math.PI / 2;
  root.syncModuleTree(true); root.shield.isActive = false;
  e.enemyShip.pos.set(10000, 10000); e.enemyShip.prevPos.copy(e.enemyShip.pos);
  e.asteroids.length = 0; e.nebulae.length = 0;
  const parts = [root, ...root.childModules];
  for (const ship of parts) {
   ship.hullHp = ship.maxHullHp * .65;
   for (let r = 4; r < ship.armor.rows - 3; r += 3) for (let c = 3; c < ship.armor.cols - 3; c += 3) {
    ship.armor.setCell(c, r, ship.armor.maxCellArmor * .2);
    ship.damageDecals.onCellDamage(c, r, ship.armor.maxCellArmor * .15);
   }
  }
  const urls = new Set(parts.flatMap(s => [s.spec.spriteUrl, ...s.scorchMarks.flatMap(m => ['base', 'glow'].map(l => damageDecalUrl(m, l)))]));
  for (const frame of arkArt.frames) for (const d of frame) urls.add(ADUN_ARK_ART + d.file);
  for (const d of arkLanceArt.frames) urls.add(ADUN_ARK_ART + d.file);
  await Promise.all([...urls].map(u => textureCache.waitForTextureImage(u)));
  const canvas = () => document.createElement('canvas');
  const mask = canvas(), current = canvas(), legacy = canvas(), legacyView = canvas(), raster = canvas();
  let oldLeaks = 0, newLeaks = 0, visiblePixels = 0, samples = 0, maxLeakAlpha = 0;
  const leaksByPose = [];
  let offHullPixels = 0;
  // Base and heat must both fit every real pose, not merely four screenshots.
  for (const frame of arkArt.frames) {
   const draw = frame.find(d => d.owner === 'CORE');
   mask.width = Math.round(draw.size[0] * arkArt.scale); mask.height = Math.round(draw.size[1] * arkArt.scale);
   const mc = mask.getContext('2d', { willReadFrequently: true });
   mc.drawImage(textureCache.getCanvasImage(ADUN_ARK_ART + draw.file), 0, 0, mask.width, mask.height);
   const mp = mc.getImageData(0, 0, mask.width, mask.height).data;
   for (const layer of ['base', 'glow']) {
    if (!renderArkDamageOverlayCanvas(current, root, draw, layer, raster)) throw Error('pose damage not ready');
    if (!renderShipDamageOverlayCanvas(legacy, root, layer)) throw Error('legacy probe not ready');
    const cp = current.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, current.width, current.height).data;
    // Register the old static sprite into the CURRENT crop before comparing:
    // animated ring crops have different widths/origins, not just new alpha.
    legacyView.width = mask.width; legacyView.height = mask.height;
    const lc = legacyView.getContext('2d', { willReadFrequently: true });
    lc.scale(mask.width / (draw.size[0] * arkArt.scale), mask.height / (draw.size[1] * arkArt.scale));
    lc.drawImage(legacy, (arkArt.parts.CORE.anchor[0] - draw.box[0]) * arkArt.scale - root.spec.pivotX,
      (arkArt.parts.CORE.anchor[1] - draw.box[1]) * arkArt.scale - root.spec.pivotY, root.spec.spriteWidth, root.spec.spriteHeight);
    const lp = lc.getImageData(0, 0, mask.width, mask.height).data;
    for (let i = 3; i < mp.length; i += 4) {
     if (!mp[i]) { if (lp[i]) oldLeaks++; if (cp[i]) { offHullPixels++; newLeaks++; maxLeakAlpha = Math.max(maxLeakAlpha, cp[i]); if (leaksByPose.length < 8) leaksByPose.push({ file: draw.file, layer, index: i, alpha: cp[i] }); } }
     else if (cp[i]) visiblePixels++;
    }
    samples++;
   }
  }
  // All tightly-cropped owners and all moving FORE poses use the same mapper.
  const crop = canvas();
  let cropSamples = 0;
  const checkCrop = (ship, draw) => {
   for (const layer of ['base', 'glow']) {
    if (!renderArkDamageOverlayCanvas(current, ship, draw, layer, raster)) throw Error('owner mask not ready');
    crop.width = current.width; crop.height = current.height;
    const cc = crop.getContext('2d', { willReadFrequently: true });
    cc.drawImage(textureCache.getCanvasImage(ADUN_ARK_ART + draw.file), 0, 0, crop.width, crop.height);
    const cp = cc.getImageData(0, 0, crop.width, crop.height).data;
    const dp = current.getContext('2d').getImageData(0, 0, current.width, current.height).data;
    for (let i = 3; i < cp.length; i += 4) if (!cp[i] && dp[i]) { offHullPixels++; newLeaks++; maxLeakAlpha = Math.max(maxLeakAlpha, dp[i]); if (leaksByPose.length < 8) leaksByPose.push({ file: draw.file, layer, index: i, alpha: dp[i] }); }
    cropSamples++;
   }
  };
  for (const draw of arkFrame(4)) checkCrop(parts.find(s => arkOwner(s.spec.sourceHullId ?? s.spec.id) === draw.owner), draw);
  const fore = parts.find(s => arkOwner(s.spec.sourceHullId ?? s.spec.id) === 'FORE');
  for (const draw of arkLanceArt.frames) checkCrop(fore, { ...draw, owner: 'FORE' });
  const damage = new ArkDamageRenderer(), active = new Set();
  damage.retainTextures(parts, 4, active);
  const liveTextureIds = active.size;
  fore.hullHp = 0; active.clear(); damage.retainTextures(parts, 4, active);
  const removedOwnerCleared = ![...active].some(id => id.startsWith('ark-damage:' + fore.id + ':'));
  fore.hullHp = fore.maxHullHp * .65;
  for (const ship of parts) for (const mark of ship.scorchMarks) mark.intensity = 0;
  active.clear(); damage.retainTextures(parts, 4, active);
  const coldGlowCleared = ![...active].some(id => id.endsWith(':glow'));
  for (const ship of parts) ship.damageDecals.advance(0, .65);
  const previous = renderer.render;
  const view = combatRenderView(e);
  window.__arkDamage = { e, parts, setTime(t) { e.combatTime = t; }, restore() { renderer.render = previous; renderer.resetVisualState(); } };
  renderer.render = (_view, _alpha, _camera, _zoom, frame) => {
   const rendered = previous.call(renderer, view, 1, root.pos, .95, { ...frame, layers: new Set(['background', 'hull']) });
   if (rendered) window.__arkDamage.drawnTime = e.combatTime;
   return rendered;
  };
  return { samples, cropSamples, oldLeaks, edgeCoverageDifferences: newLeaks, offHullPixels, maxEdgeAlpha: maxLeakAlpha, leaksByPose, visiblePixels, marks: root.scorchMarks.length, liveTextureIds, removedOwnerCleared, coldGlowCleared };
 });
 console.log('DAMAGE MASK', JSON.stringify(report));
 assert.equal(report.samples, 192); assert(report.cropSamples >= 112);
 assert(report.oldLeaks > 1000); assert.equal(report.offHullPixels, 0); assert.equal(report.edgeCoverageDifferences, 0); assert(report.visiblePixels > 1000);
 assert(report.removedOwnerCleared && report.coldGlowCleared);
 for (const [name, time] of [['00', .01], ['06', 6.1*8/96], ['11', 11.1*8/96], ['18', 18.1*8/96]]) {
  await page.evaluate(t => window.__arkDamage.setTime(t), time);
  await page.waitForFunction(t => window.__arkDamage.drawnTime === t, time);
  await page.screenshot({ path: resolve(out, 'damage-ring-' + name + '.png') });
 }
 // Exercise the actual WebGL caches at two different poses, then ensure the
 // same-frame replay does not allocate/upload another damage texture.
 const cache = await page.evaluate(async () => {
  const renderer = window.__combatRenderer, state = window.__arkDamage;
  state.setTime(2); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = renderer.textures.getStats().uploads;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const stable = renderer.textures.getStats().uploads;
  const ids = [...renderer.textures.canvasTextureRevisions.keys()].filter(k => k.includes('ark-damage:'));
  const ordinary = [...renderer.textures.canvasTextureRevisions.keys()].filter(k => k.includes('ship-damage-') && k.includes(state.e.playerShip.id));
  state.parts.forEach(s => { s.hullHp = 0; s.isDead = true; });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const remaining = [...renderer.textures.canvasTextureRevisions.keys()].filter(k => k.includes('ark-damage:'));
  state.restore();
  return { before, stable, ids: ids.length, ordinary: ordinary.length, remaining: remaining.length };
 });
 assert.equal(cache.before, cache.stable); assert(cache.ids > 0); assert(cache.ids <= report.liveTextureIds);
 assert.equal(cache.ordinary, 0); assert.equal(cache.remaining, 0);
 await writeFile(resolve(out, 'damage-alignment.json'), JSON.stringify({ ...report, cache }, null, 2));
 return '96 ring poses and 46 lance poses clip both damage layers to their current depth; cold/dead cache cleanup and actual damaged-ring screenshots';
}
