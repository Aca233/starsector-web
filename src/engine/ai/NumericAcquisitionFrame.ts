import { ShipStepBatch } from '../simulation/ShipStepBatch';
import { stageKernelWork } from './DecisionReadPlane';
import { NumericAcquisitionTree, fireRewriteWork, numericBlockerWork } from './NumericAcquisitionTree';
import { FireControlQueryRoster } from './FireControlQueryBatch';
import type { CombatEngine } from '../simulation/CombatEngine';
import { Ship, hasNativeStateCoreReaders, nativeFireControlPrototypes } from '../simulation/Ship';
import { ShipWeaponControlSystem } from '../simulation/systems/ShipWeaponControlSystem';
import { isImmutableMetadata } from '../extensions/Immutable';
import { Vector2 } from '../math/Vector2';
import { shieldCenterOffset } from '../simulation/collision/ShieldCollisionGeometry';
import type { WeaponMount } from '../simulation/Weapon';
import { ACQUISITION_WIDTH, AcquisitionField as F, AcquisitionRole as R, acquisitionSegmentEntry,
  acquireNumericShip, nearestNumericPreAim, type AcquisitionMesh, type AcquisitionInput, type AcquisitionHit } from './WeaponAcquisitionKernel';

const numericIntrinsics=(['cos','sin','atan2','asin','sqrt','hypot','abs','max','min'] as const).map(key=>[key,Math[key]] as const);
const meshes=new WeakMap<object,AcquisitionMesh>();
// Only recursively immutable metadata earns this permanent fact. Mutable pose,
// hooks and WeaponSpec never do. A replaced spec is checked afresh.
const finiteGeometry=new WeakSet<object>();
export const firePlaneWork={compiledFrames:0,geometryChecks:0,geometryHits:0,contactPlanes:0,shooterPlans:0,classBuilds:0,classHits:0};
const vectorMethods=(['clone','sub','add','addScaled','rotate','distanceTo','length','heading'] as const).map(key=>[key,Vector2.prototype[key]] as const);
const lookupGetter=(Object.prototype as {__lookupGetter__?:(key:string)=>unknown}).__lookupGetter__!;
const lookupSetter=(Object.prototype as {__lookupSetter__?:(key:string)=>unknown}).__lookupSetter__!;
export function isOwnData(obj:object,key:string):boolean {
  return Object.hasOwn(obj,key)&&lookupGetter.call(obj,key)===undefined&&lookupSetter.call(obj,key)===undefined;
}
function isOptionalOwnData(obj:object,key:string):boolean {
  return !(key in obj)||isOwnData(obj,key);
}
function finiteInput(x:number,y:number,speed:number,delay:number,range:number,facing:number,arc:number,base:number):boolean {
  return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(speed)&&Number.isFinite(delay)
    &&Number.isFinite(range)&&Number.isFinite(facing)&&Number.isFinite(arc)&&Number.isFinite(base);
}
interface MountClassification { spec:WeaponMount['spec'];finiteAmmo:boolean;roles:number;beam:boolean;guided:boolean;alwaysAim:boolean }
const immutableMountClasses=new WeakMap<WeaponMount,MountClassification>();
export const numericAcquisitionMetrics={frames:0,preAim:0,aimScans:0,singleSolves:0,segments:0,scopeFallbacks:0};
interface Scope { source:readonly Ship[]; rows:Uint32Array; members:Uint8Array; orders:Int32Array }
export interface AcquisitionQuery { origin:Vector2;delay:number;speed:number;range:number }
function meshFor(ship:Ship):AcquisitionMesh|undefined {
  const bounds=ship.spec.bounds;if(!bounds||bounds.length<3)return;
  let mesh=meshes.get(bounds);if(mesh)return mesh;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const vertices=new Float64Array(bounds.length*2);
  bounds.forEach(([x,y],i)=>{vertices[i*2]=x;vertices[i*2+1]=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);});
  mesh={vertices,minX,minY,maxX,maxY,extent:Math.max(Math.abs(minX),Math.abs(maxX))+Math.max(Math.abs(minY),Math.abs(maxY))};
  meshes.set(bounds,mesh);return mesh;
}
function nativeVector(vector:Vector2):boolean {
  return Object.getPrototypeOf(vector)===Vector2.prototype&&isOwnData(vector,'x')&&isOwnData(vector,'y')
    &&typeof vector.x==='number'&&typeof vector.y==='number'&&vectorMethods.every(([key,method])=>vector[key]===method);
}
/** Same API as the generic frame, but source/own-row/team resolved for one
 * actual native shooter plan. It is never a cross-step or firing permission. */
export interface NativeAcquisitionQueries {
  preAim(ship:Ship,mount:WeaponMount,source:readonly Ship[],query:AcquisitionQuery):AcquisitionHit|null|undefined;
  scan(ship:Ship,mount:WeaponMount,source:readonly Ship[],query:AcquisitionQuery):AcquisitionHit[]|undefined;
  solve(ship:Ship,mount:WeaponMount,target:Ship,query:AcquisitionQuery):AcquisitionHit|null|undefined;
  blocks(ship:Ship,mount:WeaponMount,x:number,y:number,tx:number,ty:number,delay:number,time:number):boolean|undefined;
}
function finiteNativeGeometry(ship:Ship):boolean {
  const spec=ship.spec;
  if(!isImmutableMetadata(spec))return false;
  if(finiteGeometry.has(spec)){firePlaneWork.geometryHits++;return true;}
  firePlaneWork.geometryChecks++;
  if(!Number.isFinite(spec.collisionRadius)||spec.bounds&&!spec.bounds.every(point=>point.every(Number.isFinite)))return false;
  finiteGeometry.add(spec);return true;
}
/** The shared prototype was checked once at frame admission. Own accessors and
 * method overrides are still checked for EACH current vector, without invoking
 * unknown methods/getters. No vector gets a persistent certificate. */
function compiledNativeVector(vector:Vector2):boolean {
  if(Object.getPrototypeOf(vector)!==Vector2.prototype||!isOwnData(vector,'x')||!isOwnData(vector,'y')
    ||typeof vector.x!=='number'||typeof vector.y!=='number')return false;
  for(const [key,value] of vectorMethods){
    if(Object.hasOwn(vector,key)&&(!isOwnData(vector,key)||vector[key]!==value))return false;
  }
  return true;
}
function nativeCompiledContact(ship:Ship):boolean {
  // Reusing phase/relationships must never bypass an instance reader override.
  for(const key of ['isCollisionless','isPhased','isVisibleTo','hasVastBulk','assemblyRoot','getShieldCenter'])
    if(Object.hasOwn(ship,key))return false;
  if(!isOwnData(ship,'isDead')||typeof ship.isDead!=='boolean')return false;
  if(Object.hasOwn(ship,'hasNativePreAimRangeReads')
    &&(!isOwnData(ship,'hasNativePreAimRangeReads')||ship.hasNativePreAimRangeReads!==Ship.prototype.hasNativePreAimRangeReads))return false;
  return finiteNativeGeometry(ship)&&ship.hasNativePreAimRangeReads()
    &&compiledNativeVector(ship.pos)&&compiledNativeVector(ship.vel)
    &&Number.isFinite(ship.pos.x)&&Number.isFinite(ship.pos.y)&&Number.isFinite(ship.vel.x)&&Number.isFinite(ship.vel.y)
    &&Number.isFinite(ship.facingRad)&&Number.isFinite(ship.teamId)&&Number.isFinite(ship.shield.radius)
    &&Number.isFinite(ship.shield.currentArcDeg)&&Number.isFinite(ship.shield.facingAngleRad)&&Math.abs(ship.shield.facingAngleRad)<100000;
}
/** Native phase-local input plane for an actual algorithm, not an owner/DTO permit.
 * All Ship references stay here. The compute kernel receives only scalars/arrays. */
export class NumericAcquisitionFrame {
  private active=true;
  private readonly a:Float64Array;
  private readonly hulls:(AcquisitionMesh|undefined)[];
  private readonly rows=new Map<Ship,number>();
  private readonly eligibility=new Map<number,Uint8Array>();
  private readonly scopes=new WeakMap<readonly Ship[],Scope>();
  private readonly trees=new Map<number,NumericAcquisitionTree>();
  private readonly sealedScopes=new WeakSet<readonly Ship[]>();
  private sealedInputs=false;
  private readonly classes=new WeakMap<WeaponMount,MountClassification>();
  private fusedBlockers?: { roots:Uint32Array; through:Uint8Array; voidShields:Uint8Array; extents:Float64Array; trees:Map<number,NumericAcquisitionTree> };
  private fusedBlockersRejected=false;
  private readonly phaseFlags:Uint8Array;
  private readonly blockerTeams:Float64Array;
  private readonly blockerDead:Uint8Array;
  private readonly blockerThrough:Uint8Array;
  private readonly blockerRoots:Ship[];
  private readonly scratchInput:AcquisitionInput={x:0,y:0,speed:0,range:0,delay:0,base:0,arc:0,beam:false,guided:false,alwaysAim:false,roles:0};
  private constructor(private readonly ships:readonly Ship[],private readonly rewrite=false,private readonly compiledPlane=false) {
    const n=ships.length;
    this.a=new Float64Array(n*ACQUISITION_WIDTH);this.hulls=new Array(n);
    this.phaseFlags=new Uint8Array(compiledPlane||rewrite?n:0);
    this.blockerTeams=new Float64Array(rewrite?n:0);
    this.blockerDead=new Uint8Array(rewrite?n:0);
    this.blockerThrough=new Uint8Array(rewrite?n:0);
    this.blockerRoots=rewrite?new Array(n):[];
    const a=this.a,teams:number[]=[];
    for(let row=0;row<n;row++){
      const ship=ships[row];
      this.hulls[row]=meshFor(ship);
      this.rows.set(ship,row);const b=row*ACQUISITION_WIDTH;
      const sx=ship.spec.shieldCenterX||0,sy=ship.spec.shieldCenterY||0;
      const sc=sx===0&&sy===0?undefined:(compiledPlane?undefined:ship.getShieldCenter());
      const fCos=sx===0&&sy===0||sc?0:Math.cos(ship.facingRad),fSin=sx===0&&sy===0||sc?0:Math.sin(ship.facingRad);
      const active=ship.shield.isActive&&ship.shield.type!=='NONE'&&ship.shield.type!=='PHASE';
      a[b]=ship.pos.x;a[b+1]=ship.pos.y;a[b+2]=ship.vel.x;a[b+3]=ship.vel.y;
      a[b+4]=ship.facingRad;a[b+5]=Math.cos(-ship.facingRad);a[b+6]=Math.sin(-ship.facingRad);
      a[b+7]=ship.spec.collisionRadius;
      a[b+8]=Math.max(ship.spec.collisionRadius,active?ship.shield.radius+shieldCenterOffset(ship):0);
      a[b+9]=sc?sc.x:sx===0&&sy===0?ship.pos.x:(sx*fCos-sy*fSin)+ship.pos.x;
      a[b+10]=sc?sc.y:sx===0&&sy===0?ship.pos.y:(sx*fSin+sy*fCos)+ship.pos.y;
      a[b+11]=ship.shield.radius;
      a[b+12]=active?ship.shield.currentArcDeg:0;
      a[b+13]=ship.shield.type==='FRONT'?ship.facingRad:ship.shield.facingAngleRad;
      const team=ship.teamId;
      a[b+14]=team;
      a[b+15]=ship.spec.hullSize==='FIGHTER'?1:ship.spec.hullSize==='FRIGATE'?2:0;
      if(!teams.includes(team))teams.push(team);
      if(compiledPlane||rewrite)this.phaseFlags[row]=Number(ship.isPhased);
      if(rewrite){
        this.blockerTeams[row]=team;
        this.blockerDead[row]=Number(ship.isDead);
        this.blockerRoots[row]=ship.assemblyRoot;
        this.blockerThrough[row]=Number(!!ship.spec.sourceHullTraits?.includes('do_not_fire_through'));
      }
    }
    if(compiledPlane) {
      firePlaneWork.compiledFrames++;
    }
    for(let t=0;t<teams.length;t++) {
      const team=teams[t],eligible=new Uint8Array(n);
      for(let row=0;row<n;row++){
        const ship=ships[row];
        eligible[row]=Number(ship.teamId!==team&&!ship.hasVastBulk&&!ship.isDead&&ship.isVisibleTo(team)&&!(compiledPlane?this.phaseFlags[row]:ship.isCollisionless));
      }
      this.eligibility.set(team,eligible);
      if(rewrite)this.trees.set(team,new NumericAcquisitionTree(this.a,eligible));
    }
    numericAcquisitionMetrics.frames++;
  }
  static create(ships:readonly Ship[],owner?:CombatEngine,batch?:ShipStepBatch):NumericAcquisitionFrame|undefined {
    const setting=import.meta.env?.VITE_COMBAT_NUMERIC_ACQUISITION;
    if(setting==='false')return;
    // Reuse only the EXISTING private cloned-command Worker contract. This is
    // neither a Ship/DTO flag nor a permanent shape cache. Generic callers keep
    // descriptor-before-getter audit; live authored hook gates remain in both.
    let owned=false;
    if(owner&&FireControlQueryRoster.isWorkerOwned(owner)) {
      if(ShipStepBatch.ownsFireContacts(batch,owner,ships)){owned=true;stageKernelWork.capturedFireFrames++;}
      else{const members=new Set(owner.ships);owned=ships.every(ship=>members.has(ship));}
    }
    // Only the authority domain earned a positive measured result. Generic
    // mutable inline engines retain the legacy default; true is a debug opt-in.
    if(setting!=='true'&&!owned)return;
    if(!nativeFireControlPrototypes()||!numericIntrinsics.every(([key,value])=>Math[key]===value))return;
    if(!owned&&!ships.every(hasNativeStateCoreReaders))return;
    const compiled=owned&&import.meta.env?.VITE_COMBAT_FIRE_FLIGHT_REWRITE!=='false'&&import.meta.env?.VITE_COMBAT_FIRE_PLANE!=='false';
    if(compiled) {
      if(!vectorMethods.every(([key,method])=>isOwnData(Vector2.prototype,key)&&Vector2.prototype[key]===method))return;
      for(const ship of ships)if(!nativeCompiledContact(ship))return;
      return new NumericAcquisitionFrame(ships,true,true);
    }
    if(!ships.every(ship=>isImmutableMetadata(ship.spec)&&ship.hasNativePreAimRangeReads()
      &&(owned||ShipWeaponControlSystem.hasNativeQueryLoop(ship.weaponControl))&&nativeVector(ship.pos)&&nativeVector(ship.vel)
      &&[ship.pos.x,ship.pos.y,ship.vel.x,ship.vel.y,ship.facingRad,ship.teamId,ship.spec.collisionRadius,
        ship.shield.radius,ship.shield.currentArcDeg,ship.shield.facingAngleRad].every(Number.isFinite)
      &&Math.abs(ship.shield.facingAngleRad)<100000
      &&(!ship.spec.bounds||ship.spec.bounds.every(point=>point.every(Number.isFinite)))))return;
    return new NumericAcquisitionFrame(ships,owned&&import.meta.env?.VITE_COMBAT_FIRE_FLIGHT_REWRITE!=='false');
  }
  private check():void {if(!this.active)throw new Error('Closed numeric acquisition frame');}
  private scope(source:readonly Ship[]):Scope|undefined {
    this.check();let scope=this.scopes.get(source);
    if(scope&&source.length===scope.rows.length&&(this.sealedScopes.has(source)||source.every((ship,i)=>ship===this.ships[scope!.rows[i]])))return scope;
    const rows=new Uint32Array(source.length),members=new Uint8Array(this.ships.length),orders=new Int32Array(this.ships.length);orders.fill(-1);
    for(let i=0;i<source.length;i++) {
      const row=this.rows.get(source[i]);if(row===undefined||members[row]){numericAcquisitionMetrics.scopeFallbacks++;return;}
      rows[i]=row;members[row]=1;orders[row]=i;
    }
    scope={source,rows,members,orders};this.scopes.set(source,scope);return scope;
  }
  /** Only the existing native ShipStepBatch invokes this after all state/motion,
   * with no callbacks/membership writes until close. Direct callers stay audited. */
  hasSealedScope(source:readonly Ship[]):boolean {return this.active&&this.rewrite&&this.sealedScopes.has(source);}
  get rewritesReadonlyPhase():boolean {return this.active&&this.rewrite;}
  sealScope(source:readonly Ship[]):void {
    if(!this.rewrite)return;
    if(this.sealedScopes.has(source)){this.sealedInputs=true;return;}
    if(this.scope(source)){this.sealedScopes.add(source);this.sealedInputs=true;}
  }
  private input(ship:Ship,mount:WeaponMount,query:AcquisitionQuery):AcquisitionInput|undefined {
    const compiled=this.sealedInputs?(this.compiledPlane?(immutableMountClasses.get(mount)??this.classes.get(mount)):this.classes.get(mount)):undefined;
    if(compiled&&compiled.spec===mount.spec&&compiled.finiteAmmo===Number.isFinite(mount.ammo)) {
      if(!finiteInput(query.origin.x,query.origin.y,query.speed,query.delay,query.range,ship.facingRad,mount.arcDeg,mount.baseAngleDeg)||!(query.speed>0&&query.range>=0&&query.delay>=0))return;
      if(this.compiledPlane)firePlaneWork.classHits++;
      const out=this.scratchInput;
      out.x=query.origin.x;out.y=query.origin.y;out.speed=query.speed;out.range=query.range;out.delay=query.delay;
      out.base=ship.facingRad+mount.baseAngleDeg*Math.PI/180;out.arc=mount.arcDeg;
      out.beam=compiled.beam;out.guided=compiled.guided;out.alwaysAim=compiled.alwaysAim;out.roles=compiled.roles;
      return out;
    }
    if(!isOwnData(mount,'spec')||!mount.spec||Object.getPrototypeOf(mount.spec)!==Object.prototype||!isOwnData(mount,'ammo')
      ||!isOwnData(mount,'baseAngleDeg')||!isOwnData(mount,'arcDeg')||typeof mount.baseAngleDeg!=='number'||typeof mount.arcDeg!=='number')return;
    const spec=mount.spec,finiteAmmo=Number.isFinite(mount.ammo);
    let classification=(isImmutableMetadata(spec)||this.compiledPlane)?immutableMountClasses.get(mount):undefined;
    if(!classification||classification.spec!==spec||classification.finiteAmmo!==finiteAmmo) {
      // Runtime weapon specs intentionally have mutable scalar refit fields.
      // Validate only the kernel's live inputs; never freeze those specs.
      for(const key of ['isBeam','isGuided','alwaysFire','isPointDefense','weaponType','passThroughFighters','passThroughFightersOnlyWhenDestroyed','aiHints'] as const) {
        if(!isOptionalOwnData(spec,key)||typeof spec[key]==='function')return;
        if(key==='aiHints'&&spec.aiHints&&!isImmutableMetadata(spec.aiHints))return;
      }
      const hints=spec.aiHints,has=(name:string)=>hints?.includes(name)??false;
      let roles=0;
      if(has('PD_ONLY'))roles|=R.PDOnly;if(has('ANTI_FTR'))roles|=R.AntiFighter;
      if(spec.passThroughFighters&&!spec.passThroughFightersOnlyWhenDestroyed)roles|=R.PassFighters;
      if(has('STRIKE'))roles|=R.Strike;
      if(spec.weaponType==='MISSILE'&&finiteAmmo&&!has('DO_NOT_AIM'))roles|=R.LimitedMissile;
      if(has('USE_VS_FRIGATES'))roles|=R.UseFrigates;if(spec.isPointDefense||has('PD')||has('PD_ONLY'))roles|=R.PD;
      classification={spec,finiteAmmo,roles,beam:!!spec.isBeam,guided:!!spec.isGuided,alwaysAim:!!spec.isGuided&&!!(spec.alwaysFire||has('DO_NOT_AIM')||has('GUIDED_POOR'))};
      if(isImmutableMetadata(spec)||(this.compiledPlane&&this.sealedInputs))immutableMountClasses.set(mount,classification);
    }
    if(!finiteInput(query.origin.x,query.origin.y,query.speed,query.delay,query.range,ship.facingRad,mount.arcDeg,mount.baseAngleDeg)
      ||!(query.speed>0&&query.range>=0&&query.delay>=0))return;
    if(this.sealedInputs){
      if(!this.compiledPlane)this.classes.set(mount,classification);
      else firePlaneWork.classBuilds++;
    }
    const out=this.scratchInput;
    out.x=query.origin.x;out.y=query.origin.y;out.speed=query.speed;out.range=query.range;out.delay=query.delay;
    out.base=ship.facingRad+mount.baseAngleDeg*Math.PI/180;out.arc=mount.arcDeg;
    out.beam=classification.beam;out.guided=classification.guided;out.alwaysAim=classification.alwaysAim;out.roles=classification.roles;
    return out;
  }
  get sharesContactPlane():boolean {return this.active&&this.compiledPlane;}
  kinematicRow(ship:Ship):number|undefined {this.check();const row=this.rows.get(ship);return row===undefined?undefined:row*ACQUISITION_WIDTH;}
  readKinematic(offset:number):number {this.check();return this.a[offset];}
  contactExtent(row:number):number {this.check();return this.a[row+8];}
  /** Only compiled sealed native scopes may consume this plane. Never memoized
   * across a frame; the mutable pass-through flags remain live per query. */
  private blockerTree(team:number):NumericAcquisitionTree|undefined {
    if(import.meta.env?.VITE_COMBAT_FUSED_NATIVE_BLOCKERS==='false'||!this.compiledPlane||this.fusedBlockersRejected)return;
    if(!this.fusedBlockers) {
      const roots=new Uint32Array(this.ships.length),through=new Uint8Array(this.ships.length),voidShields=new Uint8Array(this.ships.length),extents=new Float64Array(this.ships.length);
      const groups=new Map<Ship,number>();
      for(let row=0;row<this.ships.length;row++) {
        const ship=this.ships[row],root=this.blockerRoots[row];
        // An unknown shield accessor must retain the old live narrow-phase order.
        if(!isOptionalOwnData(ship.shield,'voidShield')){this.fusedBlockersRejected=true;return;}
        let group=groups.get(root);
        if(group===undefined){group=groups.size;groups.set(root,group);}
        roots[row]=group;through[row]=this.blockerThrough[row];voidShields[row]=Number(!!ship.shield.voidShield);
        const b=row*ACQUISITION_WIDTH;
        extents[row]=Math.max(this.hulls[row]?.extent??Math.abs(this.a[b+F.Radius]),this.a[b+F.ShieldArc]>5
          ?Math.abs(this.a[b+F.ShieldRadius])+Math.abs(this.a[b+F.ShieldX]-this.a[b+F.X])+Math.abs(this.a[b+F.ShieldY]-this.a[b+F.Y]):0);
      }
      this.fusedBlockers={roots,through,voidShields,extents,trees:new Map()};numericBlockerWork.planes++;
    }
    let tree=this.fusedBlockers.trees.get(team);
    if(!tree) {
      const n=this.ships.length,eligible=new Uint8Array(n);
      for(let row=0;row<n;row++){eligible[row]=Number(this.blockerTeams[row]===team&&!this.blockerDead[row]&&!this.phaseFlags[row]);}
      tree=new NumericAcquisitionTree(this.a,eligible,this.fusedBlockers.extents);this.fusedBlockers.trees.set(team,tree);numericBlockerWork.trees++;
    }
    return tree;
  }
  /** Called by the already-qualified native world binding, not by generic aim. */
  bindQueries(ship:Ship,source:readonly Ship[]):NativeAcquisitionQueries|undefined {
    if(!this.compiledPlane||!this.hasSealedScope(source))return;
    const scope=this.scope(source),own=this.rows.get(ship),team=ship.teamId,eligible=this.eligibility.get(team),tree=this.trees.get(team);
    if(!scope||own===undefined||!scope.members[own]||!eligible)return;
    firePlaneWork.shooterPlans++;
    const allowed=(s:Ship,src=source)=>this.active&&s===ship&&src===source&&source.length===scope.rows.length&&ship.teamId===team;
    return {
      preAim:(s,m,src,q)=>{
        if(!allowed(s,src))return;
        const input=this.input(s,m,q);if(!input)return;
        let current=s.currentTargetShip?this.rows.get(s.currentTargetShip):undefined;
        if(current!==undefined&&!scope.members[current])current=undefined;
        numericAcquisitionMetrics.preAim++;
        if(tree&&import.meta.env?.VITE_COMBAT_NATIVE_NEAREST_PREAIM!=='false')
          return tree.nearest(own,input,scope.members,scope.orders,this.hulls,eligible,current);
        return nearestNumericPreAim(this.a,this.hulls,own,tree?.query(own,input,scope.rows,scope.members,scope.orders)??scope.rows,current,input,eligible);
      },
      scan:(s,m,src,q)=>{
        if(!allowed(s,src))return;
        const input=this.input(s,m,q);if(!input)return;
        numericAcquisitionMetrics.aimScans++;const hits:AcquisitionHit[]=[];
        for(const row of tree?.query(own,input,scope.rows,scope.members,scope.orders)??scope.rows){const hit=acquireNumericShip(this.a,this.hulls,own,row,input,eligible);if(hit)hits.push(hit);}
        return hits;
      },
      solve:(s,m,target,q)=>{
        if(!allowed(s))return;
        const other=this.rows.get(target),input=this.input(s,m,q);if(other===undefined||!input)return;
        numericAcquisitionMetrics.singleSolves++;
        return acquireNumericShip(this.a,this.hulls,own,other,input,eligible,false);
      },
      blocks:(s,m,x,y,tx,ty,delay,time)=>{
        if(!allowed(s))return;
        const compiled=this.sealedInputs?immutableMountClasses.get(m):undefined;
        let passFighters:boolean;
        if(compiled&&compiled.spec===m.spec) {
          passFighters=(compiled.roles&R.PassFighters)!==0;
        } else {
          if(!isOwnData(m,'spec')||!m.spec||Object.getPrototypeOf(m.spec)!==Object.prototype)return;
          const spec=m.spec;
          if(!isImmutableMetadata(spec)){
            for(const key of ['passThroughFighters','passThroughFightersOnlyWhenDestroyed'] as const) {
              if(!isOptionalOwnData(spec,key)||typeof spec[key]==='function')return;
            }
          }
          passFighters=!!spec.passThroughFighters&&!spec.passThroughFightersOnlyWhenDestroyed;
        }
        const blockers=this.blockerTree(team);if(!blockers){numericBlockerWork.fallbacks++;return;}
        const plane=this.fusedBlockers!;
        return blockers.blocked(own,scope.members,plane.roots,plane.through,plane.voidShields,this.hulls,
          passFighters,x,y,tx,ty,delay,time);
      }
    };
  }
  preAim(ship:Ship,mount:WeaponMount,source:readonly Ship[],query:AcquisitionQuery):AcquisitionHit|null|undefined {
    this.check();const scope=this.scope(source),own=this.rows.get(ship),input=this.input(ship,mount,query),eligible=this.eligibility.get(ship.teamId);
    if(!scope||own===undefined||!input||!eligible)return;
    let current=ship.currentTargetShip?this.rows.get(ship.currentTargetShip):undefined;
    if(current!==undefined&&!scope.members[current])current=undefined;
    numericAcquisitionMetrics.preAim++;
    const rows=this.trees.get(ship.teamId)?.query(own,input,scope.rows,scope.members,scope.orders)??scope.rows;
    return nearestNumericPreAim(this.a,this.hulls,own,rows,current,input,eligible);
  }
  scan(ship:Ship,mount:WeaponMount,source:readonly Ship[],query:AcquisitionQuery):AcquisitionHit[]|undefined {
    this.check();const scope=this.scope(source),own=this.rows.get(ship),input=this.input(ship,mount,query),eligible=this.eligibility.get(ship.teamId);
    if(!scope||own===undefined||!input||!eligible)return;
    const hits:AcquisitionHit[]=[];numericAcquisitionMetrics.aimScans++;
    for(const row of this.trees.get(ship.teamId)?.query(own,input,scope.rows,scope.members,scope.orders)??scope.rows){const hit=acquireNumericShip(this.a,this.hulls,own,row,input,eligible);if(hit)hits.push(hit);}
    return hits;
  }
  solve(ship:Ship,mount:WeaponMount,target:Ship,query:AcquisitionQuery):AcquisitionHit|null|undefined {
    this.check();const own=this.rows.get(ship),other=this.rows.get(target),input=this.input(ship,mount,query),eligible=this.eligibility.get(ship.teamId);
    if(own===undefined||other===undefined||!input||!eligible)return;
    numericAcquisitionMetrics.singleSolves++;
    return acquireNumericShip(this.a,this.hulls,own,other,input,eligible,false);
  }
  segment(ship:Ship,sx:number,sy:number,ex:number,ey:number,ignoreShield=false):number|null|undefined {
    this.check();const row=this.rows.get(ship);if(row===undefined||!(Number.isFinite(sx)&&Number.isFinite(sy)&&Number.isFinite(ex)&&Number.isFinite(ey)))return;
    numericAcquisitionMetrics.segments++;
    return acquisitionSegmentEntry(this.a,row,this.hulls[row],sx,sy,ex,ey,ignoreShield);
  }
  phaseStatus(ship:Ship):boolean|undefined {
    if(!this.active||!this.rewrite)return;
    const row=this.rows.get(ship);if(row===undefined)return;
    fireRewriteWork.phaseReads++;return !!this.phaseFlags[row];
  }
  targetAllowed(ship:Ship,other:Ship):boolean|undefined {
    if(!this.active||!this.rewrite)return;const row=this.rows.get(other),eligible=this.eligibility.get(ship.teamId);
    if(row===undefined||!eligible)return;fireRewriteWork.relationshipReads++;return !!eligible[row];
  }
  friendlyBlocker(ship:Ship,other:Ship):boolean|undefined {
    if(!this.active||!this.rewrite)return;const own=this.rows.get(ship),row=this.rows.get(other);
    if(own===undefined||row===undefined)return;fireRewriteWork.relationshipReads++;
    return other!==ship&&this.blockerTeams[row]===this.blockerTeams[own]&&!this.blockerDead[row]&&!this.phaseFlags[row]
      &&(this.blockerRoots[row]!==this.blockerRoots[own]||!!this.blockerThrough[row]);
  }
  entity(row:number):Ship {this.check();return this.ships[row];}
  close():void {this.active=false;this.rows.clear();this.eligibility.clear();this.blockerRoots.length=0;this.trees.clear();this.fusedBlockers=undefined;}
}

/** Identity captured after class initialization; used only at run-time binding. */
export const nativeNumericQueryBinder=NumericAcquisitionFrame.prototype.bindQueries;
