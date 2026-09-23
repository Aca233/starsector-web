/** Authority-only stable seat identities, published rather than reconstructed by guests. */
const rosters=new WeakMap<object,ReadonlyMap<number,string>>();
export function setLanControlledRoster(world:object,roster:ReadonlyMap<number,{id:string}>):void {rosters.set(world,new Map([...roster].map(([seat,ship])=>[seat,ship.id])));}
export function lanControlledRoster(world:object):ReadonlyMap<number,string> {const value=rosters.get(world);if(!value)throw Error('Missing authority LAN roster');return value;}
