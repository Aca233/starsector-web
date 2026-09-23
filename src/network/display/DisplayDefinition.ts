import type { ShipSpec } from '../../engine/content/ShipSpec';
import { assetManager } from '../../engine/assets/AssetResolver';

/** Validate read-only metadata, not simulation content. No hullmod/system/effect
 * registry is loaded here and no executable hook is looked up by the receiver. */
export function validateDisplayDefinition(value:unknown):void {
 let units=0;
 const visit=(node:unknown,depth:number,key='')=>{
  if(depth>32||++units>200000)throw Error('Display definition budget exceeded');
  if(node===null||node===undefined||typeof node==='boolean')return;
  if(typeof node==='number'){if(!Number.isFinite(node))throw Error('Invalid display definition number');return;}
  if(typeof node==='string'){
   if(node.length>65536)throw Error('Invalid display definition string');
   if(/Url$/.test(key)&&node&&(!assetManager.isLoaded||!assetManager.hasPath(node)))throw Error('Unbundled display asset');
   return;
  }
  if(typeof node!=='object'||(!Array.isArray(node)&&Object.getPrototypeOf(node)!==Object.prototype&&Object.getPrototypeOf(node)!==null))throw Error('Non-data display definition');
  for(const name of Object.keys(node)){
   if(['__proto__','constructor','prototype'].includes(name))throw Error('Invalid display definition key');
   const descriptor=Object.getOwnPropertyDescriptor(node,name)!;
   if(!('value' in descriptor))throw Error('Display definition accessor');
   visit(descriptor.value,depth+1,name);
  }
 };
 visit(value,0);
}
export function validateDisplayShipSpec(value:unknown):asserts value is ShipSpec {
 validateDisplayDefinition(value);
 const spec=value as ShipSpec;
 if(!spec||typeof spec.id!=='string'||!spec.id.length||spec.id.length>256||typeof spec.spriteUrl!=='string'
  ||!Number.isFinite(spec.spriteWidth)||!Number.isFinite(spec.spriteHeight)||!Number.isFinite(spec.collisionRadius)
  ||!Array.isArray(spec.weaponSlots)||!Array.isArray(spec.engineSlots))throw Error('Invalid display ship definition');
}
