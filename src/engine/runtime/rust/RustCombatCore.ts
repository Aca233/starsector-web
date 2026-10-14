import { encodeRustCommands, RUST_CORE_ABI, RUST_COMMAND_WIDTH, RUST_OUTPUT_HEADER, RUST_BODY_WIDTH,
  RUST_MOTION_WIDTH, RUST_FLUX_WIDTH, RUST_SYSTEM_WIDTH, RUST_EVENT_WIDTH, RUST_LIFECYCLE_WIDTH, RUST_SHIELD_WIDTH,
  RUST_ARMOR_WIDTH,RUST_ARMOR_STATE_WIDTH,RUST_SCAR_WIDTH,RUST_COMPONENT_WIDTH,
  RUST_ENGINE_CONTROLLER_WIDTH,RUST_ENGINE_CONTROLLER_STATE_WIDTH,RUST_ENGINE_WIDTH,
  RUST_WEAPON_CONTROLLER_WIDTH,RUST_WEAPON_CONTROLLER_STATE_WIDTH,RUST_WEAPON_MOUNT_WIDTH,RUST_WEAPON_GROUP_WIDTH,RUST_WEAPON_GROUP_STATE_WIDTH,
  type RustWeaponSnapshot,type RustWeaponGroupSnapshot,
  type RustArmorSnapshot,type RustComponentSnapshot,type RustEngineSnapshot,
  RUST_PROJECTILE_WIDTH,RUST_BEAM_WIDTH,RUST_FIRE_MEMORY_WIDTH,RUST_READINESS_WIDTH,RUST_GUIDANCE_WIDTH,RUST_BEAM_EFFECT_WIDTH,RUST_GRAVITON_WIDTH,RUST_GRAVITON_HIT_WIDTH,RUST_SYSTEM_WORLD_WIDTH,RUST_RANGE_WIDTH,type RustReadinessSnapshot,
  type RustCommand, type RustCoreSnapshot, type RustBodySnapshot, type RustSystemSnapshot, type RustCoreEvent } from './RustCoreProtocol';

import {decodeRustWorld} from './RustWorldProtocol';
import { PROJECTED_FLOATS_PER_SPRITE, PROJECTED_FLOATS_PER_BATCH_SLICE, PROJECTED_FLOATS_PER_SHIP_HUD,
  PROJECTED_FLOATS_PER_SHIP_STATE, PROJECTED_WITNESS_WORDS, type ProjectedFrameViews } from './RustProjectionViews';
import { decodeRustScenePublication, type RustScenePublication } from './RustScenePublication';
import { decodeRustVisualFrame } from './RustVisualProtocol';
import type { RustPresentationFacts } from './RustCombatPresentationFacts';

export interface RustCompletedSummary {
  readonly tick:number;readonly combatTime:number;readonly resultReady:boolean;readonly winningTeam?:number;
  readonly projectileCount:number;readonly lastEventSequence:number;readonly audioSequence:number;readonly audioCount:number;
}

interface CoreExports {
  readonly memory: WebAssembly.Memory;
  core_abi(): number;
  core_command_width(): number;
  core_body_width(): number;
  core_output_header(): number;
  core_system_width(): number;
  core_event_width(): number;
  core_shield_width(): number;
  core_armor_width():number;
  core_scar_width():number;
  core_component_width():number;
  core_engine_controller_width():number;
  core_engine_width():number;
  core_weapon_controller_width():number;
  core_weapon_mount_width():number;
  core_weapon_group_width():number;
  core_projectile_width():number;
  core_beam_width():number;
  core_fire_memory_width():number;
  core_readiness_width():number;
  core_guidance_width():number;
  core_domain_mask(): number;
  core_full_battle_ready(): number;
  core_create(seed: number, visualSeed: number): number;
  core_destroy(id: number): number;
  core_input(id: number, words: number): number;
  core_apply(id: number, words: number): number;
  core_step(id: number, expectedTick: number, dt: number): number;
  core_ack_events(id: number, sequence: number): number;
  core_ack_audio?(id: number, sequence: number): number;
  core_publish(id: number): number;
  core_output_words(id: number): number;
  core_scene_publish?(id: number): number;
  core_scene_words?(id: number): number;
  core_summary_publish?(id:number):number;
  core_summary_words?(id:number):number;
  core_audio_publish?(id:number):number;
  core_audio_words?(id:number):number;
  core_batch_ptr?(): number;
  core_batch_words?(): number;
  core_project?(id: number): number;
  core_sprite_ptr?(): number;
  core_sprite_words?(): number;
  core_hud_ptr?(): number;
  core_hud_words?(): number;
  core_readback_ptr?(): number;
  core_readback_words?(): number;
  core_witness_ptr?(): number;
  core_witness_words?(): number;
  core_random(id: number, visual: number): number;
  core_next_numeric_id(id: number, visual: number): number;
}
const functions = ['core_abi', 'core_command_width', 'core_body_width', 'core_output_header',
  'core_system_width', 'core_event_width', 'core_shield_width','core_armor_width','core_scar_width','core_component_width',
  'core_engine_controller_width','core_engine_width','core_weapon_controller_width','core_weapon_mount_width','core_weapon_group_width',
  'core_projectile_width','core_beam_width','core_fire_memory_width','core_readiness_width','core_guidance_width',
  'core_ack_events', 'core_domain_mask', 'core_full_battle_ready', 'core_create', 'core_destroy',
  'core_input', 'core_apply', 'core_step', 'core_publish', 'core_output_words', 'core_random', 'core_next_numeric_id'] as const;
const reasons: Record<number, string> = {
  1: 'Unknown or destroyed Rust core', 2: 'Invalid Rust command or timestep',
  3: 'Invalid or duplicate Rust spawn', 4: 'Stale Rust entity handle',
  5: 'Rust identity, tick or event sequence exhausted', 6: 'Stale Rust tick', 7: 'Non-finite Rust domain result',
  8: 'Unknown or duplicate Rust domain definition or installation'
};
export class RustCoreCommandError extends Error {
  constructor(readonly code: number) { super(reasons[code] ?? 'Rust core rejected operation'); }
}

/** Resident development core. Intentionally not connected to CombatAuthority
 * until AI/fire/damage/content and presentation migration are actually ready. */
export class RustCombatCore {
  private readonly id: number;
  private tick = 0;
  private closed = false;
  private faulted = false;
  private buffer: ArrayBuffer;
  private memoryRevision = 1;
  readonly fullBattleReady = false;
  get memoryEpoch(): number { this.checkMemory(); return this.memoryRevision; }
  get implementedDomains(): number { this.assertOpen(); return this.call(() => this.exports.core_domain_mask()); }

  static async create(source: BufferSource | WebAssembly.Module, seed = 0x51a7e5ed): Promise<RustCombatCore> {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error('Invalid Rust combat seed');
    const instance = source instanceof WebAssembly.Module
      ? await WebAssembly.instantiate(source, {})
      : (await WebAssembly.instantiate(source, {})).instance;
    const exports = instance.exports;
    if (!(exports.memory instanceof WebAssembly.Memory) || functions.some(name => typeof exports[name] !== 'function'))
      throw new Error('Rust combat core exports differ');
    const core = exports as unknown as CoreExports;
    if (core.core_abi() !== RUST_CORE_ABI) throw new Error('Rust combat ABI differs');
    if (core.core_command_width() !== RUST_COMMAND_WIDTH || core.core_body_width() !== RUST_BODY_WIDTH
      || core.core_output_header() !== RUST_OUTPUT_HEADER || core.core_system_width() !== RUST_SYSTEM_WIDTH
      || core.core_event_width() !== RUST_EVENT_WIDTH || core.core_shield_width() !== RUST_SHIELD_WIDTH
      || core.core_armor_width()!==RUST_ARMOR_WIDTH||core.core_scar_width()!==RUST_SCAR_WIDTH
      || core.core_component_width()!==RUST_COMPONENT_WIDTH||core.core_engine_controller_width()!==RUST_ENGINE_CONTROLLER_WIDTH
      || core.core_engine_width()!==RUST_ENGINE_WIDTH||core.core_weapon_controller_width()!==RUST_WEAPON_CONTROLLER_WIDTH
      || core.core_weapon_mount_width()!==RUST_WEAPON_MOUNT_WIDTH||core.core_weapon_group_width()!==RUST_WEAPON_GROUP_WIDTH
      ||core.core_projectile_width()!==RUST_PROJECTILE_WIDTH||core.core_beam_width()!==RUST_BEAM_WIDTH||core.core_fire_memory_width()!==RUST_FIRE_MEMORY_WIDTH
      ||core.core_readiness_width()!==RUST_READINESS_WIDTH||core.core_guidance_width()!==RUST_GUIDANCE_WIDTH) throw new Error('Rust combat record layout differs');
    if (core.core_full_battle_ready() !== 0) throw new Error('Development binding requires its verified domain contract');
    return new RustCombatCore(core, seed);
  }

  private constructor(private readonly exports: CoreExports, seed: number) {
    this.id = exports.core_create(seed, (seed ^ 0x9e3779b9) >>> 0) >>> 0;
    if (!this.id) throw new Error('Rust core instance allocation failed');
    this.buffer = exports.memory.buffer;
  }

  apply(commands: readonly RustCommand[]): void {
    this.applyPacked(encodeRustCommands(commands));
  }
  applyPacked(commands: Float64Array): void {
    this.assertOpen();
    if (commands.length > 0xffff_ffff) throw new Error('Rust command packet exceeds address space');
    const pointer = this.call(() => this.exports.core_input(this.id, commands.length)) >>> 0;
    if (!pointer && commands.length) throw new Error('Rust command buffer allocation failed');
    this.view(pointer, commands.length).set(commands);
    this.accept(this.call(() => this.exports.core_apply(this.id, commands.length)));
  }

  step(dt = 1 / 60): void {
    this.assertOpen();
    this.accept(this.call(() => this.exports.core_step(this.id, this.tick, dt)));
    this.tick++;
  }

  /** Complete scene authority facts, detached from Wasm memory. Legacy domain
   * fixtures can still load a module without this production-only channel. */
  scenePublication(): RustScenePublication {
    this.assertOpen();
    const publish = this.exports.core_scene_publish, words = this.exports.core_scene_words;
    if (!publish || !words) throw Error('Rust module lacks scene publication');
    const pointer = this.call(() => publish(this.id)) >>> 0;
    if (!pointer) throw Error('Rust scene publication is incomplete');
    const length = this.call(() => words(this.id)) >>> 0;
    const scene = decodeRustScenePublication(new Float64Array(this.view(pointer, length)),true);
    if (scene.tick !== this.tick) throw Error('Rust scene publication tick differs');
    return scene;
  }

  /** Small actual completed-frame facts, independent of full display decoding. */
  completedSummary():RustCompletedSummary {
    this.assertOpen();const publish=this.exports.core_summary_publish,words=this.exports.core_summary_words;
    if(!publish||!words)throw Error('Rust module lacks completed summary');
    return this.call(()=>{const pointer=publish(this.id)>>>0,length=words(this.id)>>>0;if(!pointer||length!==10)throw Error('Rust completed summary layout differs');
      const v=new Float64Array(this.view(pointer,length));
      if(v.some(n=>!Number.isFinite(n))||v[0]!==1||v[1]!==this.tick||v[2]<0||![v[3],v[4]].every(n=>n===0||n===1)
        ||![v[5],v[6],v[7],v[8],v[9]].every(n=>Number.isSafeInteger(n)&&n>=0)||v[5]>0xffffffff||v[6]>0xffffffff
        ||v[9]>250_000||v[9]>v[8]||v[4]===0&&v[5]!==0)throw Error('Rust completed summary values differ');
      return {tick:v[1],combatTime:v[2],resultReady:v[3]===1,winningTeam:v[4]===1?v[5]:undefined,projectileCount:v[6],lastEventSequence:v[7],audioSequence:v[8],audioCount:v[9]};});
  }
  /** Same retained ordered native audio; reading never acknowledges it. */
  audioPublication():RustPresentationFacts['audio'] {
    this.assertOpen();const publish=this.exports.core_audio_publish,words=this.exports.core_audio_words;
    if(!publish||!words)throw Error('Rust module lacks retained audio publication');
    return this.call(()=>{const pointer=publish(this.id)>>>0,length=words(this.id)>>>0;if(!pointer||length>8_000_000)throw Error('Rust audio publication layout differs');
      const frame=decodeRustVisualFrame(new Float64Array(this.view(pointer,length)));
      if(frame.ships.length||frame.cameraShakeIntensity!==0||Object.values(frame.visuals).some(v=>v.length))throw Error('Rust audio publication contains unrelated facts');
      return frame.audio;});
  }

  /** One-way projection of the authority, returning the f64 replay witness.
   * Read-only: it draws no RNG and mutates no state, so it can run alongside
   * the snapshot channel while the presentation wiring is still in progress. */
  projectedWitness(): Float64Array {
    this.assertOpen();
    const project = this.exports.core_project, pointerOf = this.exports.core_witness_ptr, wordsOf = this.exports.core_witness_words;
    if (typeof project !== 'function' || typeof pointerOf !== 'function' || typeof wordsOf !== 'function') {
      throw new Error('Rust core lacks the projection channel');
    }
    this.call(() => project(this.id));
    const words = this.call(() => wordsOf()) >>> 0;
    if (words !== 22) { this.faulted = true; throw new Error('Projected witness layout differs'); }
    return this.view(this.call(() => pointerOf()) >>> 0, words);
  }
  /** Zero-copy frame views shaped for the direct batch renderer. The returned
   * arrays are live Wasm memory: upload them before any call that can grow it. */
  projectionFrameViews(): ProjectedFrameViews {
    this.assertOpen();
    const project = this.exports.core_project;
    if (typeof project !== 'function' || typeof this.exports.core_sprite_ptr !== 'function'
      || typeof this.exports.core_hud_ptr !== 'function' || typeof this.exports.core_batch_ptr !== 'function') {
      throw new Error('Rust core lacks the projection channel');
    }
    this.call(() => project(this.id));
    const spriteWords = this.call(() => this.exports.core_sprite_words?.() ?? 0) >>> 0;
    const hudWords = this.call(() => this.exports.core_hud_words?.() ?? 0) >>> 0;
    const batchWords = this.call(() => this.exports.core_batch_words?.() ?? 0) >>> 0;
    const empty = new Float32Array(0);
    return {
      spriteInstances: this.viewF32(this.call(() => this.exports.core_sprite_ptr?.() ?? 0) >>> 0, spriteWords),
      spriteCount: spriteWords / PROJECTED_FLOATS_PER_SPRITE,
      batchSlices: this.viewF32(this.call(() => this.exports.core_batch_ptr?.() ?? 0) >>> 0, batchWords),
      batchSliceCount: batchWords / PROJECTED_FLOATS_PER_BATCH_SLICE,
      ribbons: empty, ribbonCount: 0,
      events: empty, eventCount: 0,
      particleBursts: empty, particleBurstCount: 0,
      hudTelemetry: this.viewF32(this.call(() => this.exports.core_hud_ptr?.() ?? 0) >>> 0, hudWords),
      hudShipCount: hudWords / PROJECTED_FLOATS_PER_SHIP_HUD,
    };
  }
  snapshot(): RustCoreSnapshot {
    this.assertOpen();
    const pointer = this.call(() => this.exports.core_publish(this.id)) >>> 0;
    const length = this.call(() => this.exports.core_output_words(this.id)) >>> 0;
    // Copy once. Returning a raw Wasm view would let display code mutate authority
    // and would become detached when a later spawn or command grows memory.
    const data = new Float64Array(this.view(pointer, length));
    const count = data[3], systemCount = data[12], eventCount = data[13], shieldCount = data[16];
    const armorCount=data[17],cellCount=data[18],scarCount=data[19],componentCount=data[20];
    const controllerCount=data[21],engineCount=data[22],engineIndexCount=data[23];
    const weaponControllerCount=data[24],weaponMountCount=data[25],weaponGroupCount=data[26],weaponMemberCount=data[27],weaponIndexCount=data[28];
    const projectileCount=data[29],beamCount=data[30],fireMemoryCount=data[32];
    const readinessCount=data[33],readinessTargetCount=data[34];
    const guidanceCount=data[35],immuneCount=data[36];
    const beamEffectCount=data[37],gravitonCount=data[38],gravitonHitCount=data[39];
    const worldCount=data[40],worldWordCount=data[41],rangeCount=data[42],worldBlockSize=data[43];
    if (data[0] !== RUST_CORE_ABI || data[1] !== this.tick || !Number.isInteger(count) || count < 0
      || !Number.isInteger(systemCount) || systemCount < 0 || !Number.isInteger(eventCount) || eventCount < 0
      || !Number.isInteger(shieldCount) || shieldCount < 0
      || [armorCount,cellCount,scarCount,componentCount,controllerCount,engineCount,engineIndexCount,
        weaponControllerCount,weaponMountCount,weaponGroupCount,weaponMemberCount,weaponIndexCount,projectileCount,beamCount,fireMemoryCount,readinessCount,readinessTargetCount,guidanceCount,immuneCount,beamEffectCount,gravitonCount,gravitonHitCount,worldCount,worldWordCount,rangeCount].some(n=>!Number.isSafeInteger(n)||n<0)
      || length !== RUST_OUTPUT_HEADER + count * RUST_BODY_WIDTH + systemCount * RUST_SYSTEM_WIDTH + shieldCount * RUST_SHIELD_WIDTH
        +armorCount*RUST_ARMOR_WIDTH+cellCount+scarCount*RUST_SCAR_WIDTH+componentCount*RUST_COMPONENT_WIDTH
        +controllerCount*RUST_ENGINE_CONTROLLER_WIDTH+engineCount*RUST_ENGINE_WIDTH+engineIndexCount+eventCount*RUST_EVENT_WIDTH
        +weaponControllerCount*RUST_WEAPON_CONTROLLER_WIDTH+weaponMountCount*RUST_WEAPON_MOUNT_WIDTH+weaponGroupCount*RUST_WEAPON_GROUP_WIDTH+weaponMemberCount+weaponIndexCount
        +projectileCount*RUST_PROJECTILE_WIDTH+beamCount*RUST_BEAM_WIDTH+fireMemoryCount*RUST_FIRE_MEMORY_WIDTH
        +readinessCount*RUST_READINESS_WIDTH+readinessTargetCount*2+guidanceCount*RUST_GUIDANCE_WIDTH+immuneCount*2
        +beamEffectCount*RUST_BEAM_EFFECT_WIDTH+gravitonCount*RUST_GRAVITON_WIDTH+gravitonHitCount*RUST_GRAVITON_HIT_WIDTH+worldCount*RUST_SYSTEM_WORLD_WIDTH+worldWordCount+rangeCount*RUST_RANGE_WIDTH+worldBlockSize) {
      this.faulted = true;
      throw new Error('Rust publication contract differs');
    }
    const bodies: RustBodySnapshot[] = [];
    const systemLists = new Map<number, RustSystemSnapshot[]>();
    const systemsOffset = RUST_OUTPUT_HEADER + count * RUST_BODY_WIDTH;
    const shieldsOffset = systemsOffset + systemCount * RUST_SYSTEM_WIDTH;
    const armorOffset=shieldsOffset+shieldCount*RUST_SHIELD_WIDTH,cellsOffset=armorOffset+armorCount*RUST_ARMOR_WIDTH;
    const scarsOffset=cellsOffset+cellCount,componentsOffset=scarsOffset+scarCount*RUST_SCAR_WIDTH;
    const controllersOffset=componentsOffset+componentCount*RUST_COMPONENT_WIDTH,enginesOffset=controllersOffset+controllerCount*RUST_ENGINE_CONTROLLER_WIDTH;
    const engineIndicesOffset=enginesOffset+engineCount*RUST_ENGINE_WIDTH;
    const weaponControllersOffset=engineIndicesOffset+engineIndexCount,weaponMountsOffset=weaponControllersOffset+weaponControllerCount*RUST_WEAPON_CONTROLLER_WIDTH;
    const weaponGroupsOffset=weaponMountsOffset+weaponMountCount*RUST_WEAPON_MOUNT_WIDTH,weaponMembersOffset=weaponGroupsOffset+weaponGroupCount*RUST_WEAPON_GROUP_WIDTH;
    const weaponIndicesOffset=weaponMembersOffset+weaponMemberCount;
    const bodyMap=new Map<number,RustBodySnapshot>();
    const shieldValues = new Map<number, Float64Array>();
    for (let index = 0; index < shieldCount; index++) {
      const offset = shieldsOffset + index * RUST_SHIELD_WIDTH;
      if (shieldValues.has(data[offset])) { this.faulted = true; throw new Error('Duplicate Rust shield owner'); }
      shieldValues.set(data[offset],data.subarray(offset + 3,offset + RUST_SHIELD_WIDTH));
    }
    for (let index = 0; index < count; index++) {
      const offset = RUST_OUTPUT_HEADER + index * RUST_BODY_WIDTH;
      const shipOffset = offset + 4 + RUST_MOTION_WIDTH, row = shipOffset + 1;
      const systems: RustSystemSnapshot[] = []; systemLists.set(data[offset], systems);
      const body:RustBodySnapshot={id: data[offset], handle: {slot: data[offset + 1], generation: data[offset + 2]},
        order: data[offset + 3], motion: data.subarray(offset + 4, shipOffset),
        ship: data[shipOffset] === 1 ? {flags: data[row], flux: data.subarray(row + 1, row + 1 + RUST_FLUX_WIDTH),
          clock: data.subarray(row + 20, row + 29), hardFluxDissipationFraction: data[row + 29],
          zeroFluxMinimum: data[row + 30], allowZeroFluxAtAnyLevel: data[row + 31], systems,
          shield: shieldValues.get(data[offset]),components:[],fireMemories:[],damagePolicy:data.subarray(row+32,row+40)} : undefined};
      bodies.push(body);bodyMap.set(body.id,body);
    }
    const owner=(offset:number)=>{
      const body=bodyMap.get(data[offset]);
      if(!body?.ship||body.handle.slot!==data[offset+1]||body.handle.generation!==data[offset+2]){
        this.faulted=true;throw Error('Rust domain owner differs');
      }
      return body.ship;
    };
    for (let index = 0; index < systemCount; index++) {
      const offset = systemsOffset + index * RUST_SYSTEM_WIDTH;
      const list = systemLists.get(data[offset]);
      if (!list) { this.faulted = true; throw new Error('Rust system owner differs'); }
      list.push({id: data[offset + 3], specId: data[offset + 4], values: data.subarray(offset + 3, offset + 3 + RUST_LIFECYCLE_WIDTH),
        upkeep: data.subarray(offset + 3 + RUST_LIFECYCLE_WIDTH,offset + RUST_SYSTEM_WIDTH - 1), defense: data[offset + RUST_SYSTEM_WIDTH - 1] === 1});
    }
    for (let index = 0; index < shieldCount; index++) {
      const offset = shieldsOffset + index * RUST_SHIELD_WIDTH, body = bodyMap.get(data[offset]);
      if (!body?.ship || body.handle.slot !== data[offset+1] || body.handle.generation !== data[offset+2]) {
        this.faulted = true; throw new Error('Rust shield owner differs');
      }
    }
    let expectedCellOffset=0;
    for(let index=0;index<armorCount;index++){
      const offset=armorOffset+index*RUST_ARMOR_WIDTH,ship=owner(offset);
      const start=data[offset+3+RUST_ARMOR_STATE_WIDTH],size=data[offset+4+RUST_ARMOR_STATE_WIDTH];
      if(ship.armor||start!==expectedCellOffset||!Number.isSafeInteger(size)||size<1||start+size>cellCount
        ||size!==data[offset+3]*data[offset+4]){this.faulted=true;throw Error('Rust armor cells differ');}
      (ship as {armor?:RustArmorSnapshot}).armor={
        values:data.subarray(offset+3,offset+3+RUST_ARMOR_STATE_WIDTH),
        cells:Float32Array.from(data.subarray(cellsOffset+start,cellsOffset+start+size)),scars:[]};
      expectedCellOffset+=size;
    }
    if(expectedCellOffset!==cellCount){this.faulted=true;throw Error('Rust armor cell ownership differs');}
    for(let index=0;index<scarCount;index++){
      const offset=scarsOffset+index*RUST_SCAR_WIDTH,armor=owner(offset).armor;
      if(!armor){this.faulted=true;throw Error('Rust scar armor owner differs');}
      const values=data.subarray(offset+3,offset+RUST_SCAR_WIDTH);
      // Pure presentation. No random draw or simulation write crosses to TS.
      values[4]=Math.min(255,(values[5]+values[7])*(.9+.1*Math.sin(values[9])))/255;
      (armor.scars as Float64Array[]).push(values);
    }
    for(let index=0;index<componentCount;index++){
      const offset=componentsOffset+index*RUST_COMPONENT_WIDTH,ship=owner(offset);
      (ship.components as RustComponentSnapshot[]).push({id:data[offset+3],values:data.subarray(offset+3,offset+RUST_COMPONENT_WIDTH)});
    }
    let expectedEngineOffset=0;
    for(let index=0;index<controllerCount;index++){
      const offset=controllersOffset+index*RUST_ENGINE_CONTROLLER_WIDTH,ship=owner(offset);
      const start=data[offset+3+RUST_ENGINE_CONTROLLER_STATE_WIDTH],size=data[offset+4+RUST_ENGINE_CONTROLLER_STATE_WIDTH];
      if(ship.engines||start!==expectedEngineOffset||!Number.isSafeInteger(size)||size<0||start+size>engineIndexCount){
        this.faulted=true;throw Error('Rust engine event ownership differs');
      }
      (ship as {engines?:RustEngineSnapshot}).engines={values:data.subarray(offset+3,offset+3+RUST_ENGINE_CONTROLLER_STATE_WIDTH),
        engines:[],justDisabled:data.subarray(engineIndicesOffset+start,engineIndicesOffset+start+size)};
      expectedEngineOffset+=size;
    }
    if(expectedEngineOffset!==engineIndexCount){this.faulted=true;throw Error('Rust engine event range differs');}
    for(let index=0;index<engineCount;index++){
      const offset=enginesOffset+index*RUST_ENGINE_WIDTH,controller=owner(offset).engines;
      if(!controller||data[offset+3]!==controller.engines.length){this.faulted=true;throw Error('Rust engine topology differs');}
      (controller.engines as Float64Array[]).push(data.subarray(offset+3,offset+RUST_ENGINE_WIDTH));
    }
    for(const body of bodies){const e=body.ship?.engines;if(!e)continue;
      if(e.values[3]!==e.engines.length||e.justDisabled.some(n=>!Number.isInteger(n)||n<0||n>=e.engines.length)){
        this.faulted=true;throw Error('Rust engine slot count differs');
      }
    }
    let expectedWeaponIndex=0;
    for(let i=0;i<weaponControllerCount;i++) {
      const offset=weaponControllersOffset+i*RUST_WEAPON_CONTROLLER_WIDTH,ship=owner(offset),range=offset+3+RUST_WEAPON_CONTROLLER_STATE_WIDTH;
      const start=data[range],size=data[range+1],repairStart=data[range+2],repairSize=data[range+3];
      if(ship.weapons||[start,size,repairStart,repairSize].some(n=>!Number.isSafeInteger(n)||n<0)
        ||start!==expectedWeaponIndex||repairStart!==start+size||repairStart+repairSize>weaponIndexCount){this.faulted=true;throw Error('Rust weapon queue ranges differ');}
      (ship as {weapons?:RustWeaponSnapshot}).weapons={values:data.subarray(offset+3,range),mounts:[],groups:[],
        justDisabled:data.subarray(weaponIndicesOffset+start,weaponIndicesOffset+start+size),
        justRepaired:data.subarray(weaponIndicesOffset+repairStart,weaponIndicesOffset+repairStart+repairSize)};
      expectedWeaponIndex=repairStart+repairSize;
    }
    if(expectedWeaponIndex!==weaponIndexCount){this.faulted=true;throw Error('Rust weapon queue ownership differs');}
    for(let i=0;i<weaponMountCount;i++) {
      const offset=weaponMountsOffset+i*RUST_WEAPON_MOUNT_WIDTH,ship=owner(offset),w=ship.weapons;
      if(!w||data[offset+3]!==ship.components[w.mounts.length]?.id){this.faulted=true;throw Error('Rust weapon health topology differs');}
      (w.mounts as Float64Array[]).push(data.subarray(offset+3,offset+RUST_WEAPON_MOUNT_WIDTH));
    }
    let expectedMember=0;
    for(let i=0;i<weaponGroupCount;i++) {
      const offset=weaponGroupsOffset+i*RUST_WEAPON_GROUP_WIDTH,w=owner(offset).weapons,range=offset+3+RUST_WEAPON_GROUP_STATE_WIDTH;
      const start=data[range],size=data[range+1];
      if(!w||start!==expectedMember||!Number.isSafeInteger(size)||size<0||start+size>weaponMemberCount||size!==data[range-1]){this.faulted=true;throw Error('Rust weapon group members differ');}
      (w.groups as RustWeaponGroupSnapshot[]).push({values:data.subarray(offset+3,range),members:data.subarray(weaponMembersOffset+start,weaponMembersOffset+start+size)});
      expectedMember+=size;
    }
    if(expectedMember!==weaponMemberCount){this.faulted=true;throw Error('Rust weapon member ownership differs');}
    for(const b of bodies){const w=b.ship?.weapons;if(!w)continue;
      const ids=new Set(b.ship!.components.map(c=>c.id));
      if(w.values[1]!==w.mounts.length||w.mounts.length!==b.ship!.components.length||w.values[2]!==w.groups.length
        ||w.justDisabled.some(id=>!ids.has(id))||w.justRepaired.some(id=>!ids.has(id))){this.faulted=true;throw Error('Rust weapon installed counts differ');}
    }
    const events: RustCoreEvent[] = [];
    const projectileOffset=weaponIndicesOffset+weaponIndexCount,beamOffset=projectileOffset+projectileCount*RUST_PROJECTILE_WIDTH;
    const projectiles=Array.from({length:projectileCount},(_,i)=>data.subarray(projectileOffset+i*RUST_PROJECTILE_WIDTH,projectileOffset+(i+1)*RUST_PROJECTILE_WIDTH));
    const beams=Array.from({length:beamCount},(_,i)=>data.subarray(beamOffset+i*RUST_BEAM_WIDTH,beamOffset+(i+1)*RUST_BEAM_WIDTH));
    const fireMemoryOffset=beamOffset+beamCount*RUST_BEAM_WIDTH;
    for(let i=0;i<fireMemoryCount;i++){
      const offset=fireMemoryOffset+i*RUST_FIRE_MEMORY_WIDTH,ship=owner(offset),component=data[offset+3];
      if(!ship.weapons?.mounts.some(m=>m[0]===component)||ship.fireMemories.some(m=>m[0]===component)){
        this.faulted=true;throw Error('Rust fire memory owner differs');
      }
      (ship.fireMemories as Float64Array[]).push(data.subarray(offset+3,offset+RUST_FIRE_MEMORY_WIDTH));
    }
    const readinessOffset=fireMemoryOffset+fireMemoryCount*RUST_FIRE_MEMORY_WIDTH;
    const readinessTargetsOffset=readinessOffset+readinessCount*RUST_READINESS_WIDTH;
    let expectedReadinessTargetOffset=0;
    for(let i=0;i<readinessCount;i++){
      const offset=readinessOffset+i*RUST_READINESS_WIDTH,ship=owner(offset),start=data[offset+30],size=data[offset+31];
      if(ship.readiness||start!==expectedReadinessTargetOffset||!Number.isSafeInteger(size)||size<0||start+size>readinessTargetCount){
        this.faulted=true;throw Error('Rust readiness target ownership differs');
      }
      (ship as {readiness?:RustReadinessSnapshot}).readiness={values:data.subarray(offset+3,offset+RUST_READINESS_WIDTH),
        targets:data.subarray(readinessTargetsOffset+start*2,readinessTargetsOffset+(start+size)*2)};
      expectedReadinessTargetOffset+=size;
    }
    if(expectedReadinessTargetOffset!==readinessTargetCount){this.faulted=true;throw Error('Rust readiness target count differs');}
    const guidanceOffset=readinessTargetsOffset+readinessTargetCount*2,immuneOffset=guidanceOffset+guidanceCount*RUST_GUIDANCE_WIDTH;
    let expectedImmune=0;const seenGuidance=new Set<number>();
    const guidance=Array.from({length:guidanceCount},(_,i)=>{
      const offset=guidanceOffset+i*RUST_GUIDANCE_WIDTH,serial=data[offset],size=data[offset+24],start=data[offset+25];
      if(seenGuidance.has(serial)||!projectiles.some(p=>p[0]===serial)||start!==expectedImmune||!Number.isSafeInteger(size)||size<0||start+size>immuneCount){
        this.faulted=true;throw Error('Rust guidance owner or immune range differs');}
      seenGuidance.add(serial);expectedImmune+=size;
      return {values:data.subarray(offset,offset+RUST_GUIDANCE_WIDTH),immune:data.subarray(immuneOffset+start*2,immuneOffset+(start+size)*2)};
    });
    if(expectedImmune!==immuneCount){this.faulted=true;throw Error('Rust guidance immune count differs');}
    const beamEffectOffset=immuneOffset+immuneCount*2;
    const beamEffects=Array.from({length:beamEffectCount},(_,i)=>data.subarray(beamEffectOffset+i*RUST_BEAM_EFFECT_WIDTH,beamEffectOffset+(i+1)*RUST_BEAM_EFFECT_WIDTH));
    const seenBeamEffects=new Set<number>();for(const e of beamEffects){if(seenBeamEffects.has(e[0])||!beams.some(b=>b[0]===e[0])){
      this.faulted=true;throw Error('Rust beam effect owner differs');}seenBeamEffects.add(e[0]);}
    const gravitonOffset=beamEffectOffset+beamEffectCount*RUST_BEAM_EFFECT_WIDTH,gravitonHitOffset=gravitonOffset+gravitonCount*RUST_GRAVITON_WIDTH;
    let expectedGraviton=0;
    for(let i=0;i<gravitonCount;i++){const offset=gravitonOffset+i*RUST_GRAVITON_WIDTH,ship=owner(offset),size=data[offset+4],start=data[offset+5];
      if(ship.graviton||start!==expectedGraviton||!Number.isSafeInteger(size)||size<0||start+size>gravitonHitCount){
        this.faulted=true;throw Error('Rust graviton listener range differs');}
      (ship as {graviton?:{multiplier:number;hits:Float64Array}}).graviton={multiplier:data[offset+3],
        hits:data.subarray(gravitonHitOffset+start*RUST_GRAVITON_HIT_WIDTH,gravitonHitOffset+(start+size)*RUST_GRAVITON_HIT_WIDTH)};expectedGraviton+=size;
    }
    if(expectedGraviton!==gravitonHitCount){this.faulted=true;throw Error('Rust graviton listener count differs');}
    const worldOffset=gravitonHitOffset+gravitonHitCount*RUST_GRAVITON_HIT_WIDTH,worldWordsOffset=worldOffset+worldCount*RUST_SYSTEM_WORLD_WIDTH;
    let expectedWorld=0;
    for(let i=0;i<worldCount;i++){const offset=worldOffset+i*RUST_SYSTEM_WORLD_WIDTH,ship=owner(offset),start=data[offset+3],size=data[offset+4];
      if(ship.systemWorld||start!==expectedWorld||!Number.isSafeInteger(size)||size<98||start+size>worldWordCount){this.faulted=true;throw Error('Rust system world ownership differs');}
      (ship as {systemWorld?:Float64Array}).systemWorld=data.subarray(worldWordsOffset+start,worldWordsOffset+start+size);expectedWorld+=size;
    }
    if(expectedWorld!==worldWordCount){this.faulted=true;throw Error('Rust system world range differs');}
    const rangeOffset=worldWordsOffset+worldWordCount;
    for(let i=0;i<rangeCount;i++){const offset=rangeOffset+i*RUST_RANGE_WIDTH,ship=owner(offset),index=data[offset+3];
      if(!ship.weapons||!Number.isInteger(index)||index<0||index>=ship.weapons.mounts.length||ship.weaponRanges?.some(r=>r[0]===index)){
        this.faulted=true;throw Error('Rust weapon range owner differs');}
      if(!ship.weaponRanges)(ship as {weaponRanges?:readonly Float64Array[]}).weaponRanges=[];
      (ship.weaponRanges as Float64Array[]).push(data.subarray(offset+3,offset+RUST_RANGE_WIDTH));
    }
    if(!Number.isSafeInteger(worldBlockSize)||worldBlockSize<0){this.faulted=true;throw Error('Rust world block size differs');}
    const worldBlockOffset=rangeOffset+rangeCount*RUST_RANGE_WIDTH;
    const world=this.call(()=>decodeRustWorld(data.subarray(worldBlockOffset,worldBlockOffset+worldBlockSize),true));
    const eventsOffset = worldBlockOffset+worldBlockSize;
    for (let index = 0; index < eventCount; index++) {
      const offset = eventsOffset + index * RUST_EVENT_WIDTH;
      events.push({sequence: data[offset], tick: data[offset + 1], id: data[offset + 2],
        handle: {slot: data[offset + 3], generation: data[offset + 4]}, systemId: data[offset + 5],
        kind: data[offset + 6], value: data[offset + 7],detail:[data[offset+8],data[offset+9]]});
    }
    return {tick: data[1], combatTime: data[2], random: [data[4], data[5], data[6]],
      visualRandom: [data[7], data[8], data[9]], domains: data[10], fullBattleReady: false, bodies,
      projectiles,guidance,beams,beamEffects,world,lastOrdnanceSerial:data[31],events, lastEventSequence: data[14], acknowledgedEventSequence: data[15]};
  }

  acknowledgeEvents(sequence: number): void {
    this.assertOpen(); this.accept(this.call(() => this.exports.core_ack_events(this.id, sequence)));
  }
  acknowledgeAudio(sequence: number): void {
    this.assertOpen(); const ack = this.exports.core_ack_audio; if (!ack) throw Error('Rust module lacks retained audio acknowledgement');
    this.accept(this.call(() => ack(this.id, sequence)));
  }

  nextRandom(visual = false): number {
    this.assertOpen();
    const value = this.call(() => this.exports.core_random(this.id, Number(visual)));
    if (!Number.isFinite(value)) throw new Error('Rust random stream unavailable');
    return value;
  }
  nextNumericId(visual = false): number {
    this.assertOpen();
    const value = this.call(() => this.exports.core_next_numeric_id(this.id, Number(visual)));
    if (!Number.isFinite(value)) throw new Error('Rust identity stream unavailable');
    return value;
  }

  dispose(): void {
    if (this.closed) return;
    if (!this.faulted) this.call(() => this.exports.core_destroy(this.id));
    this.closed = true;
  }
  private assertOpen(): void {
    if (this.closed || this.faulted) throw new Error(this.faulted ? 'Rust core trapped; recovery is required' : 'Rust core is closed');
  }
  private call<T>(operation: () => T): T {
    try { return operation(); }
    catch (error) { this.faulted = true; throw error; }
  }
  private accept(code: number): void { if (code) throw new RustCoreCommandError(code); }
  private checkMemory(): void {
    const next = this.exports.memory.buffer;
    if (next !== this.buffer) { this.buffer = next; this.memoryRevision++; }
  }
  private viewF32(pointer: number, count: number): Float32Array {
    this.checkMemory();
    if (pointer % 4 || !Number.isInteger(count) || count < 0 || pointer + count * 4 > this.buffer.byteLength) {
      this.faulted = true;
      throw new Error('Rust core memory range differs');
    }
    return new Float32Array(this.buffer, pointer, count);
  }
  private view(pointer: number, words: number): Float64Array {
    this.checkMemory();
    if (pointer % 8 || !Number.isInteger(words) || words < 0 || pointer + words * 8 > this.buffer.byteLength) {
      this.faulted = true;
      throw new Error('Rust core memory range differs');
    }
    return new Float64Array(this.buffer, pointer, words);
  }
}
