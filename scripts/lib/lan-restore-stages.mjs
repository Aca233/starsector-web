import assert from 'node:assert/strict';
/** Optional LanDisplaySnapshot restore-phase diagnosis. No per-node timing. */
export function lanRestoreStagePlugin(enabled) {
 const replace=(code,needle,value)=>{assert.equal(code.split(needle).length-1,1,'restore stage probe anchor: '+needle);return code.replace(needle,value);};
 return {name:'lan-restore-stages-diagnosis',enforce:'pre',transform(code,id){
  if(!enabled||!id.replaceAll('\\','/').split('?')[0].endsWith('/src/network/LanDisplaySnapshot.ts'))return;
  code=code.replaceAll('\r\n','\n');
  const begin=kind=>`const postRestore${kind}: any=(globalThis as any).__postBlockTimeline?{kind:'${kind}',tick:frame.tick,ships:frame.ships.length,crafts:frame.crafts.length,start:restoreProbeClock()}:null;`;
  const mark=(kind,key)=>`if(postRestore${kind})postRestore${kind}.${key}=restoreProbeClock();`;
  const end=kind=>`if(postRestore${kind}){postRestore${kind}.end=restoreProbeClock();restoreProbeAppend(postRestore${kind});}`;
  code=replace(code,'function validate(frame:CombatSnapshot):void {','function validate(frame:CombatSnapshot):void {'+begin('validate'));
  code=replace(code,"throw Error('Invalid separate projectile snapshot');\n}","throw Error('Invalid separate projectile snapshot');\n"+end('validate')+'\n}');
  code=replace(code,'function decodeShips(frame:CombatSnapshot,state:Receiver,reset:boolean,world?:LanDisplayWorld) {','function decodeShips(frame:CombatSnapshot,state:Receiver,reset:boolean,world?:LanDisplayWorld) {'+begin('ships'));
  code=replace(code,' const specs=frame.craftSpecs.map',mark('ships','definitions')+'\n const specs=frame.craftSpecs.map');
  code=replace(code,' const next=new Map<string,LanDisplayShip>();',mark('ships','specs')+'\n const next=new Map<string,LanDisplayShip>();');
  code=replace(code,' // Allocate the entire identity table BEFORE',mark('ships','identity')+'\n // Allocate the entire identity table BEFORE');
  code=replace(code,' // References may not contain module cycles',mark('ships','records')+'\n // References may not contain module cycles');
  code=replace(code,' state.ships=next;',' state.ships=next;'+end('ships'));
  code=replace(code,' const continuous=!reset',begin('world')+'\n const continuous=!reset');
  code=replace(code,' const layouts=decoded??decodeShips',mark('world','poses')+'\n const layouts=decoded??decodeShips');
  code=replace(code,' const ships=state.ships;',mark('world','shipsDone')+'\n const ships=state.ships;');
  code=replace(code,' for(const key of worldKeys) {',mark('world','craftLists')+'\n for(const key of worldKeys) {');
  code=replace(code,' for(const key of readKeys) {',mark('world','worldKeys')+'\n for(const key of readKeys) {');
  code=replace(code,' for(const p of world.projectiles){',mark('world','readKeys')+'\n for(const p of world.projectiles){');
  code=replace(code,' world.deployment.applySnapshot(frame.deployment!);',mark('world','wings')+'\n world.deployment.applySnapshot(frame.deployment!);'+mark('world','deployment'));
  code=replace(code,' state.tick=frame.tick;',mark('world','targets')+'\n state.tick=frame.tick;');
  code=replace(code,'state.projectileTick=frame.projectileVisuals===1?-1:frame.tick;\n}', 'state.projectileTick=frame.projectileVisuals===1?-1:frame.tick;\n'+end('world')+'\n}');
  return `const restoreProbeClock=()=>performance.timeOrigin+performance.now();
const restoreProbeAppend=(row:any)=>{const trace=(globalThis as any).__postBlockTimeline;if(!trace)return;if(trace.restores.length<20000)trace.restores.push(row);else trace.overflow++;};\n`+code;
 }};
}
