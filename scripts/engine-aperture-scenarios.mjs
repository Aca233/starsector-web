import { createLanWorld } from '../src/network/LanWorld.ts';
import { EngineController } from '../src/engine/simulation/systems/EngineController.ts';
import { validateShipSpec } from '../src/engine/modding/ContentValidation.ts';
import { RenderShipProjection } from '../src/engine/runtime/local/RenderShipProjection.ts';
export const hulls=['web_zhefeng','web_sc2_hyperion','web_gloriana','web_zhuyuan','web_expanse_rocinante','web_spear_of_adun_ark'];
export function createWorld(hull){return createLanWorld({id:'exhaust-check',seed:41,hostId:'p0',snapshotHz:60,players:[{id:'p0',seat:0,team:0,hull},{id:'p1',seat:1,team:1,hull:'web_zhefeng'}],options:{assignment:'teams',battleSize:600,aiHulls:[[],[]]}}).engine;}
export function checkExhaustRules(){
 const checks=[],measurements=[];const ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const hull of hulls){
  const engine=createWorld(hull),root=engine.playerShip,ships=engine.ships.filter(s=>s.teamId===root.teamId);
  let visible=0,hidden=0;
  for(const ship of ships){
   validateShipSpec(ship.spec,{allowExistingId:true});
   const legacy=structuredClone(ship.spec);for(const slot of legacy.engineSlots)delete slot.exhaust;
   const seed=()=>({next:()=>.5});
   const a=new EngineController(ship.spec,seed()),b=new EngineController(legacy,seed());
   ok(JSON.stringify(a.engines)===JSON.stringify(b.engines),hull+'/'+ship.id+': visual metadata preserves engine health/contribution');
   for(const slot of ship.spec.engineSlots){
    if(slot.exhaust?.mode==='HIDDEN'){hidden++;continue;}
    if(hull==='web_spear_of_adun_ark')continue;
    visible++;ok(slot.exhaust===undefined||slot.exhaust.mode==='NATIVE',hull+'/'+ship.id+': actual native drawing path, no custom aperture/mouth');
    ok(!slot.exhaust?.mouth,ship.id+': no custom opening overlay');
    if(slot.exhaust?.mode==='NATIVE')ok(Number.isFinite(slot.exhaust.envelopeWidth)&&slot.exhaust.envelopeWidth>=slot.width,ship.id+': authored envelope matches wider nozzle without changing physical width');
   }
   if(hull==='web_zhefeng'){
    const projection=new RenderShipProjection();projection.begin();const display=projection.project(ship);projection.finish();
    ok(display.spec.engineSlots.every(s=>s.exhaust?.mode==='NATIVE'),hull+': render projection preserves native mode');
   }
  }
  measurements.push({hull,visible,hidden,ships:ships.length});
 }
 const zhefeng=createWorld('web_zhefeng').playerShip.spec;
 const bad=structuredClone(zhefeng);bad.engineSlots[0].exhaust.mode='APERTURE';
 let rejected=false;try{validateShipSpec(bad,{allowExistingId:true});}catch{rejected=true;}ok(rejected,'Removed custom aperture mode rejected');
 for(const width of [NaN,0,-1]){const invalid=structuredClone(zhefeng);invalid.engineSlots[0].exhaust.envelopeWidth=width;let fails=false;try{validateShipSpec(invalid,{allowExistingId:true});}catch{fails=true;}ok(fails,'Invalid visual envelope rejected: '+width);}
 return {checks,measurements,scope:'Engine construction, data validation and render projection; no multiplayer claim'};
}
