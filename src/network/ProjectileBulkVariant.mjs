/** A negotiated viewer variant, never an authoritative save/simulation state.
 * Only projectiles are replaced. Mines/beams/FX, ship state and discrete events
 * remain exact. The relay must have current application-consumed visual credit
 * for this same sync before choosing it, and retain the full fallback. */
export function withoutBulkProjectiles(frame){
 if(!frame||!frame.world||typeof frame.world!=='object'||!Object.hasOwn(frame.world,'projectiles')||frame.projectileVisuals!==undefined)throw Error('Invalid full projectile snapshot');
 return {...frame,projectileVisuals:1,world:{...frame.world,projectiles:[]}};
}
