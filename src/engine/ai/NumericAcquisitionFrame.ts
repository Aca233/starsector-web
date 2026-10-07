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
  return Object.getPrototypeOf(vector)===Vector2.prototype && ['x','y'].every(key=> {
    const d=Object.getOwnPropertyDescriptor(vector,key);return !!d&&'value'in d&&typeof d.value==='number';
  })&&vectorMethods.every(([key,method])=>vector[key]===method);
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
  if(Object.getPrototypeOf(vector)!==Vector2.prototype)return false;
  const x=Object.getOwnPropertyDescriptor(vector,'x'),y=Object.getOwnPropertyDescriptor(vector,'y');
  if(!x||!y||!('value'in x)||!('value'in y)||typeof x.value!=='number'||typeof y.value!=='number')return false;
  for(const [key,value] of vectorMethods){
    const d=Object.getOwnPropertyDescriptor(vector,key);
    if(d&&(!('value'in d)||d.value!==value))return false;
  }
  return true;
}
function nativeCompiledContact(ship:Ship):boolean {
  // Reusing phase/relationships must never bypass an instance reader override.
  for(const key of ['isCollisionless','isPhased','isVisibleTo','hasVastBulk','assemblyRoot','getShieldCenter'])
    if(Object.hasOwn(ship,key))return false;
  const dead=Object.getOwnPropertyDescriptor(ship,'isDead');
  if(!dead||!('value'in dead)||typeof dead.value!=='boolean')return false;
  const reader=Object.getOwnPropertyDescriptor(ship,'hasNativePreAimRangeReads');
  if(reader&&(!('value'in reader)||reader.value!==Ship.prototype.hasNativePreAimRangeReads))return false;
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
  private readonly classes=new WeakMap<WeaponMount,{spec:WeaponMount['spec'];roles:number;beam:boolean;guided:boolean;alwaysAim:boolean}>();
  private fusedBlockers?: { roots:Uint32Array; through:Uint8Array; voidShields:Uint8Array; extents:Float64Array; trees:Map<number,NumericAcquisitionTree> };
  private fusedBlockersRejected=false;
  private readonly phase=new Map<Ship,boolean>();
  private readonly blockers=new Map<Ship,{team:number;dead:boolean;root:Ship;through:boolean}>();
  private constructor(private readonly ships:readonly Ship[],private readonly rewrite=false,private readonly compiledPlane=false) {
    this.a=new Float64Array(ships.length*ACQUISITION_WIDTH);this.hulls=ships.map(meshFor);
    ships.forEach((ship,row)=> {
      this.rows.set(ship,row);const b=row*ACQUISITION_WIDTH,center=ship.getShieldCenter();
      const active=ship.shield.isActive&&ship.shield.type!=='NONE'&&ship.shield.type!=='PHASE';
      this.a.set([ship.pos.x,ship.pos.y,ship.vel.x,ship.vel.y,ship.facingRad,Math.cos(-ship.facingRad),Math.sin(-ship.facingRad),
        ship.spec.collisionRadius,Math.max(ship.spec.collisionRadius,active?ship.shield.radius+shieldCenterOffset(ship):0),
        center.x,center.y,ship.shield.radius,active?ship.shield.currentArcDeg:0,
        ship.shield.type==='FRONT'?ship.facingRad:ship.shield.facingAngleRad,ship.teamId,
        ship.spec.hullSize==='FIGHTER'?1:ship.spec.hullSize==='FRIGATE'?2:0],b);
    });
    if(compiledPlane) {
      firePlaneWork.compiledFrames++;
      // Admission excludes external phase callbacks/runtime collision modifiers.
      // Read dynamic phase once in this span, never reuse it in another stage.
      for(const ship of ships)this.phase.set(ship,ship.isPhased);
    }
    for(const team of new Set(ships.map(ship=>ship.teamId))) {
      const eligible=new Uint8Array(ships.length);
      ships.forEach((ship,row)=>{eligible[row]=Number(ship.teamId!==team&&!ship.hasVastBulk&&!ship.isDead&&ship.isVisibleTo(team)&&!(compiledPlane?this.phase.get(ship):ship.isCollisionless));});
      this.eligibility.set(team,eligible);
      if(rewrite)this.trees.set(team,new NumericAcquisitionTree(this.a,eligible));
    }
    if(rewrite)for(const ship of ships){if(!compiledPlane)this.phase.set(ship,ship.isPhased);this.blockers.set(ship,{team:ship.teamId,dead:ship.isDead,root:ship.assemblyRoot,through:!!ship.spec.sourceHullTraits?.includes('do_not_fire_through')});}
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
      if(!vectorMethods.every(([key,method])=>Object.getOwnPropertyDescriptor(Vector2.prototype,key)?.value===method))return;
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
  sealScope(source:readonly Ship[]):void {if(this.rewrite&&this.scope(source)){this.sealedScopes.add(source);this.sealedInputs=true;}}
  private input(ship:Ship,mount:WeaponMount,query:AcquisitionQuery):AcquisitionInput|undefined {
    const compiled=this.sealedInputs?this.classes.get(mount):undefined;
    if(compiled&&compiled.spec===mount.spec) {
      if(![query.origin.x,query.origin.y,query.speed,query.delay,query.range,ship.facingRad,mount.arcDeg,mount.baseAngleDeg].every(Number.isFinite)||!(query.speed>0&&query.range>=0&&query.delay>=0))return;
      if(this.compiledPlane)firePlaneWork.classHits++;
      return {x:query.origin.x,y:query.origin.y,speed:query.speed,range:query.range,delay:query.delay,base:ship.facingRad+mount.baseAngleDeg*Math.PI/180,arc:mount.arcDeg,beam:compiled.beam,guided:compiled.guided,alwaysAim:compiled.alwaysAim,roles:compiled.roles};
    }
    const specDescriptor=Object.getOwnPropertyDescriptor(mount,'spec'),ammo=Object.getOwnPropertyDescriptor(mount,'ammo');
    if(!specDescriptor||!('value'in specDescriptor)||!specDescriptor.value||Object.getPrototypeOf(specDescriptor.value)!==Object.prototype||!ammo||!('value'in ammo))return;
    // Runtime weapon specs intentionally have mutable scalar refit fields.
    // Validate only the kernel's live inputs; never freeze those specs.
    for(const key of ['isBeam','isGuided','alwaysFire','isPointDefense','weaponType','passThroughFighters','passThroughFightersOnlyWhenDestroyed','aiHints']) {
      const d=Object.getOwnPropertyDescriptor(specDescriptor.value,key);
      if(!d&&key in specDescriptor.value || d&&(!('value'in d)||typeof d.value==='function'))return;
      if(key==='aiHints'&&d?.value&&!isImmutableMetadata(d.value))return;
    }
    for(const key of ['baseAngleDeg','arcDeg'] as const) {
      const d=Object.getOwnPropertyDescriptor(mount,key);if(!d||!('value'in d)||typeof d.value!=='number')return;
    }
    const spec=mount.spec,hints=spec.aiHints,has=(name:string)=>hints?.includes(name)??false;
    if(![query.origin.x,query.origin.y,query.speed,query.delay,query.range,ship.facingRad,mount.arcDeg,mount.baseAngleDeg].every(Number.isFinite)
      ||!(query.speed>0&&query.range>=0&&query.delay>=0))return;
    let roles=0;
    if(has('PD_ONLY'))roles|=R.PDOnly;if(has('ANTI_FTR'))roles|=R.AntiFighter;
    if(spec.passThroughFighters&&!spec.passThroughFightersOnlyWhenDestroyed)roles|=R.PassFighters;
    if(has('STRIKE'))roles|=R.Strike;
    if(spec.weaponType==='MISSILE'&&Number.isFinite(mount.ammo)&&!has('DO_NOT_AIM'))roles|=R.LimitedMissile;
    if(has('USE_VS_FRIGATES'))roles|=R.UseFrigates;if(spec.isPointDefense||has('PD')||has('PD_ONLY'))roles|=R.PD;
    const classification={spec,roles,beam:!!spec.isBeam,guided:!!spec.isGuided,alwaysAim:!!spec.isGuided&&!!(spec.alwaysFire||has('DO_NOT_AIM')||has('GUIDED_POOR'))};
    if(this.sealedInputs){this.classes.set(mount,classification);if(this.compiledPlane)firePlaneWork.classBuilds++;}
    return {x:query.origin.x,y:query.origin.y,speed:query.speed,range:query.range,delay:query.delay,
      base:ship.facingRad+mount.baseAngleDeg*Math.PI/180,arc:mount.arcDeg,beam:classification.beam,guided:classification.guided,
      alwaysAim:classification.alwaysAim,roles};
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
        const ship=this.ships[row],contact=this.blockers.get(ship)!;
        const d=Object.getOwnPropertyDescriptor(ship.shield,'voidShield');
        // An unknown shield accessor must retain the old live narrow-phase order.
        if(d&&!('value'in d)||!d&&'voidShield'in ship.shield){this.fusedBlockersRejected=true;return;}
        if(!groups.has(contact.root))groups.set(contact.root,groups.size);
        roots[row]=groups.get(contact.root)!;through[row]=Number(contact.through);voidShields[row]=Number(!!d?.value);
        const b=row*ACQUISITION_WIDTH;
        extents[row]=Math.max(this.hulls[row]?.extent??Math.abs(this.a[b+F.Radius]),this.a[b+F.ShieldArc]>5
          ?Math.abs(this.a[b+F.ShieldRadius])+Math.abs(this.a[b+F.ShieldX]-this.a[b+F.X])+Math.abs(this.a[b+F.ShieldY]-this.a[b+F.Y]):0);
      }
      this.fusedBlockers={roots,through,voidShields,extents,trees:new Map()};numericBlockerWork.planes++;
    }
    let tree=this.fusedBlockers.trees.get(team);
    if(!tree) {
      const eligible=new Uint8Array(this.ships.length);
      this.ships.forEach((ship,row)=>{const c=this.blockers.get(ship)!;eligible[row]=Number(c.team===team&&!c.dead&&!this.phase.get(ship));});
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
        const spec=Object.getOwnPropertyDescriptor(m,'spec');
        if(!spec||!('value'in spec)||!spec.value||Object.getPrototypeOf(spec.value)!==Object.prototype)return;
        for(const key of ['passThroughFighters','passThroughFightersOnlyWhenDestroyed']) {
          const d=Object.getOwnPropertyDescriptor(spec.value,key);
          if(d&&(!('value'in d)||typeof d.value==='function')||!d&&key in spec.value)return;
        }
        const blockers=this.blockerTree(team);if(!blockers){numericBlockerWork.fallbacks++;return;}
        const plane=this.fusedBlockers!;
        return blockers.blocked(own,scope.members,plane.roots,plane.through,plane.voidShields,this.hulls,
          !!spec.value.passThroughFighters&&!spec.value.passThroughFightersOnlyWhenDestroyed,x,y,tx,ty,delay,time);
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
    this.check();const row=this.rows.get(ship);if(row===undefined||![sx,sy,ex,ey].every(Number.isFinite))return;
    numericAcquisitionMetrics.segments++;
    return acquisitionSegmentEntry(this.a,row,this.hulls[row],sx,sy,ex,ey,ignoreShield);
  }
  phaseStatus(ship:Ship):boolean|undefined {if(!this.active||!this.rewrite)return;fireRewriteWork.phaseReads++;return this.phase.get(ship);}
  targetAllowed(ship:Ship,other:Ship):boolean|undefined {
    if(!this.active||!this.rewrite)return;const row=this.rows.get(other),eligible=this.eligibility.get(ship.teamId);
    if(row===undefined||!eligible)return;fireRewriteWork.relationshipReads++;return !!eligible[row];
  }
  friendlyBlocker(ship:Ship,other:Ship):boolean|undefined {
    if(!this.active||!this.rewrite)return;const own=this.blockers.get(ship),row=this.blockers.get(other);
    if(!own||!row)return;fireRewriteWork.relationshipReads++;
    return other!==ship&&row.team===own.team&&!row.dead&&!this.phase.get(other)&&(row.root!==own.root||row.through);
  }
  entity(row:number):Ship {this.check();return this.ships[row];}
  close():void {this.active=false;this.rows.clear();this.eligibility.clear();this.phase.clear();this.blockers.clear();this.trees.clear();this.fusedBlockers=undefined;}
}

/** Identity captured after class initialization; used only at run-time binding. */
export const nativeNumericQueryBinder=NumericAcquisitionFrame.prototype.bindQueries;
