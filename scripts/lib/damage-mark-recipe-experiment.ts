/** Phase45 experiment only. Never imported by production. See the source-notes. */
import {ArmorGrid} from '../../src/engine/simulation/ArmorGrid';
import {SimulationRandom} from '../../src/engine/simulation/SimulationRandom';
import {Vector2} from '../../src/engine/math/Vector2';
import type {ScorchMark} from '../../src/engine/simulation/ShipDamageState';

type Geometry = [number, number, number, number, number, number];
type Style = {size:number; rotationRad:number; kind:string; variant:number; pulsePeriod:number};
type Birth = {cursor:number; geometry:Geometry; cell:number; x:number; y:number; style?:Style};
const births = new WeakMap<object, Birth>();
let recording = false;
export function recordDamageBirths(enabled:boolean) { recording=enabled; }
const nativeCenter=ArmorGrid.prototype.getCellCenterLocal;
const nativeArrayMap=Array.prototype.map;
const FULL_KEYS=['cellIndex','localPos','opacity','intensity','heat','justHit','flash','flashElapsed','phase','pulsePeriod','size','rotationRad','kind','variant'];
const finite=(x:unknown): x is number=>typeof x==='number'&&Number.isFinite(x);
export const DAMAGE_RECIPE_LIMITS=Object.freeze({marks:4096,frameMarks:16384,geometries:64,cache:4096});
const stats={captured:0,fallback:0,born:0};
export const damageRecipeDiagnostics=()=>({...stats});
function validGeometry(g:any):g is Geometry {
 return Array.isArray(g)&&g.length===6&&g.every(finite)
  &&Number.isSafeInteger(g[0])&&g[0]>0&&Number.isSafeInteger(g[1])&&g[1]>0&&g[0]*g[1]<=1048576
  &&g[4]>0&&g[5]>0&&Number.isFinite(Math.max(g[4]*1.5,40)*1.5)&&Number.isFinite(g[2]+g[0]*g[4])&&Number.isFinite(g[3]+g[1]*g[5]);
}
export function beginDamageBirth(armor:ArmorGrid,random:SimulationRandom,c:number,r:number):Birth|null {
 if(!recording||Object.getPrototypeOf(armor)!==ArmorGrid.prototype||armor.getCellCenterLocal!==nativeCenter
  ||!Number.isInteger(c)||!Number.isInteger(r)||c<0||r<0||c>=armor.cols||r>=armor.rows)return null;
 const geometry:Geometry=[armor.cols,armor.rows,armor.minX,armor.minY,armor.cellWidth,armor.cellHeight];
 if(!validGeometry(geometry))return null;
 const cursor=random.reserveSamples(0);if(cursor===null)return null;
 return {cursor,geometry,cell:r*armor.cols+c,x:armor.minX+(c+.5)*armor.cellWidth,y:armor.minY+(r+.5)*armor.cellHeight};
}
export function finishDamageBirth(mark:ScorchMark,birth:Birth|null) {
 if(!birth||mark.cellIndex!==birth.cell||mark.localPos.x!==birth.x||mark.localPos.y!==birth.y)return;
 birth.style={size:mark.size,rotationRad:mark.rotationRad,kind:mark.kind,variant:mark.variant,pulsePeriod:mark.pulsePeriod};
 births.set(mark,birth);stats.born++;
}
export type DamageRecipe={ $damageMarks:1; geometry:Geometry[]; rows:number[][] };
/** Explicit native graph only; generic callers must not call this validator. */
export function captureDamageRecipe(marks:unknown,budget:{rows:number}):DamageRecipe|null {
 if(!Array.isArray(marks)||Object.getPrototypeOf(marks)!==Array.prototype||marks.map!==nativeArrayMap
   ||Object.hasOwn(marks,'map')||marks.length<2||marks.length>DAMAGE_RECIPE_LIMITS.marks
   ||budget.rows+marks.length>DAMAGE_RECIPE_LIMITS.frameMarks||Reflect.ownKeys(marks).length!==marks.length+1)return null;
 const geometry:Geometry[]=[],rows:number[][]=[];
 for(let i=0;i<marks.length;i++) {
  const mark=marks[i];if(!mark||Object.getPrototypeOf(mark)!==Object.prototype){stats.fallback++;return null;}
  const b=births.get(mark),s=b?.style,keys=Object.keys(mark);
  if(!b||!s||keys.length!==FULL_KEYS.length||keys.some((k,j)=>k!==FULL_KEYS[j])
    ||!mark.localPos||Object.getPrototypeOf(mark.localPos)!==Vector2.prototype||mark.cellIndex!==b.cell
    ||mark.localPos.x!==b.x||mark.localPos.y!==b.y||mark.size!==s.size||mark.rotationRad!==s.rotationRad
    ||mark.kind!==s.kind||mark.variant!==s.variant||mark.pulsePeriod!==s.pulsePeriod
    ||![mark.opacity,mark.intensity,mark.heat,mark.flash,mark.flashElapsed,mark.phase].every(finite)
    ||typeof mark.justHit!=='boolean'){stats.fallback++;return null;}
  let id=geometry.findIndex(g=>g.every((v,j)=>v===b.geometry[j]));
  if(id===-1){if(geometry.length>=DAMAGE_RECIPE_LIMITS.geometries)return null;id=geometry.length;geometry.push(b.geometry.slice() as Geometry);}
  rows.push([id,b.cell,b.cursor,mark.opacity,mark.intensity]);
 }
 budget.rows+=rows.length;stats.captured+=rows.length;
 return {$damageMarks:1,geometry,rows};
}
function replay(cursor:number,width:number):Style {
 const rng=SimulationRandom.fromCursor(cursor),first=rng.next(),second=rng.next();
 const kind=second>.75?'burns':first>.75?'holes':'cracks',variant=rng.next()>.5?0:1;
 const rotationRad=rng.next()*Math.PI*2,size=Math.max(width*1.5,40)*(1+.5*rng.next());
 return {kind,variant,rotationRad,size,pulsePeriod:.25+.75*rng.next()};
}
/** Bounded receiver-local, recomputable cache; frame and render objects never alias it. */
export class DamageRecipeDecoder {
 private readonly styles=new Map<number,{width:number;style:Style}>();
 public get cacheSize(){return this.styles.size;}
 public decode(packet:any,target:any,budget:{rows:number}):any[] {
  if(packet?.$damageMarks!==1||!Array.isArray(packet.geometry)||!packet.geometry.length
    ||packet.geometry.length>DAMAGE_RECIPE_LIMITS.geometries||!Array.from(packet.geometry).every(validGeometry)
    ||!Array.isArray(packet.rows)||packet.rows.length>DAMAGE_RECIPE_LIMITS.marks
    ||budget.rows+packet.rows.length>DAMAGE_RECIPE_LIMITS.frameMarks)throw Error('Invalid damage recipe');
  // Validate the complete batch before touching display state or the style cache.
  for(const row of packet.rows) {
   if(!Array.isArray(row)||row.length!==5||![row[0],row[1],row[2],row[3],row[4]].every(finite)||!Number.isSafeInteger(row[0])||row[0]<0
      ||row[0]>=packet.geometry.length||!Number.isSafeInteger(row[1])||row[1]<0
      ||row[1]>=packet.geometry[row[0]][0]*packet.geometry[row[0]][1]
      ||!Number.isInteger(row[2])||row[2]<0)throw Error('Invalid damage recipe row');
  }
  const output=Array.isArray(target)?target:[];
  budget.rows+=packet.rows.length;
  for(let i=0;i<packet.rows.length;i++) {
   const [gId,cell,cursor,opacity,intensity]=packet.rows[i],g=packet.geometry[gId];
   let cached=this.styles.get(cursor);
   if(!cached||cached.width!==g[4]) {
    cached={width:g[4],style:replay(cursor,g[4])};
    if(!this.styles.has(cursor)&&this.styles.size>=DAMAGE_RECIPE_LIMITS.cache)this.styles.delete(this.styles.keys().next().value!);
    this.styles.set(cursor,cached);
   }
   const s=cached.style,prior=output[i],mark=prior&&typeof prior==='object'&&!Array.isArray(prior)?prior:{};
   // Match the original Vector2 formulas and Float64 operation ordering exactly.
   const x=g[2]+(cell%g[0]+.5)*g[4],y=g[3]+(Math.floor(cell/g[0])+.5)*g[5];
   mark.cellIndex=cell;
   if(mark.localPos instanceof Vector2){mark.localPos.x=x;mark.localPos.y=y;}else mark.localPos=new Vector2(x,y);
   mark.opacity=opacity;mark.intensity=intensity;mark.size=s.size;mark.rotationRad=s.rotationRad;mark.kind=s.kind;mark.variant=s.variant;
   output[i]=mark;
  }
  output.length=packet.rows.length;return output;
 }
}
