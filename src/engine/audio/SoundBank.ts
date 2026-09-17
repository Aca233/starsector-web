import weaponSounds from '../data/generated/weapon-sounds.json';
import systemSounds from '../data/generated/system-sounds.json';
import { assetManager } from '../assets/AssetResolver';
import { immutableCopy } from '../extensions/Immutable';
export interface SoundSample { file: string; pitch: number; volume: number }
const nativeWeaponSounds: Record<string, readonly SoundSample[]> = {...weaponSounds,...systemSounds};
const paths: Record<string, string> = {
    // 武器开火
    tpc_fire: 'sounds/sfx_wpn_energy/thermal_pulse_cannon_fire_01.ogg',
    tachyon_fire: 'sounds/sfx_wpn_energy/tachyon_lance_fire_01.ogg',
    autopulse_fire: 'sounds/sfx_wpn_energy/autopulse_laser_fire_01.ogg',
    mark9_fire: 'sounds/sfx_wpn_guns/autocannon_fire_01.ogg',
    mauler_fire: 'sounds/sfx_wpn_guns/mauler_fire_01.ogg',
    hveldriver_fire: 'sounds/sfx_wpn_guns/hypervel_driver_fire_01_loud.ogg',
    annihilator_fire: 'sounds/sfx_wpn_missiles/annihilator_fire_01.ogg',
    
    // 舰船战术系统
    burn_drive_activate: 'sounds/sfx_systems/burn_drive_activate.ogg',
    burn_drive_loop: 'sounds/sfx_systems/burn_drive_loop.ogg',
    burn_drive_deactivate: 'sounds/sfx_systems/burn_drive_deactivate.ogg',
    fortress_shield_loop: 'sounds/sfx_systems/fortress_shield_loop.ogg',

    // 护盾与幅能
    shield_up: 'sounds/sfx_shields/shields_up_large.ogg',
    shield_down: 'sounds/sfx_shields/shields_down_large.ogg',
    shield_hit: 'sounds/sfx_impacts/shield_hit_heavy_01.ogg',
    overload: 'sounds/sfx_shields/shields_burnout_oneshot.ogg',
    flux_vent: 'sounds/sfx_flux/flux_vent.ogg',
    flux_flush_loop: 'sounds/sfx_flux/flux_flush_loop.ogg',

    // 碰撞与爆炸
    ship_collision: 'sounds/sfx_impacts/collision_ship_vs_ship_01.ogg',
    explosion: 'sounds/sfx_impacts/explosion_01.ogg',

    // UI与火控
    autofire_toggle: 'sounds/sfx_interface/autofire_toggle_01.ogg',

    // 发动机环境音
    engine_lotek: 'sounds/sfx_engines/engine_01_lotek_04_capital.ogg',
    engine_hitek: 'sounds/sfx_engines/engine_03_hitek_04_capital.ogg',

    // 相位系统与水雷打击
    phase_activate: 'sounds/sfx_systems/phase_cloak_activate.ogg',
    phase_deactivate: 'sounds/sfx_systems/phase_cloak_deactivate.ogg',
    mine_teleport: 'sounds/sfx_systems/mine_strike_teleport_01.ogg',
    mine_ping: 'sounds/sfx_systems/mine_strike_pinged_01.ogg',
    mine_windup_heavy: 'sounds/sfx_systems/mine_strike_windup_01.ogg',
    mine_explosion: 'sounds/sfx_systems/mine_strike_explosion_01.ogg',

    // 新增武器音效
    heavyblaster_fire: 'sounds/sfx_wpn_energy/heavy_blaster_fire_01.ogg',
    pdburst_fire: 'sounds/sfx_wpn_energy/burst_pd_fire_01.ogg',
    sabot_fire: 'sounds/sfx_wpn_missiles/annihilator_fire_01.ogg',
    typhoon_fire: 'sounds/sfx_wpn_missiles/annihilator_fire_01.ogg',
    lightmg_fire: 'sounds/sfx_wpn_guns/light_machinegun_fire_01.ogg',
    flak_fire: 'sounds/sfx_wpn_guns/flak_fire_01.ogg',
    flak_explosion: 'sounds/sfx_systems/canister_flak_explosion_01.ogg',
    flare_launch: 'sounds/sfx_systems/flare_launcher_active_triplet.ogg',
    missile_warning: 'sounds/sfx_interface/ui_radar_detect_missile.ogg',
    missile_explosion: 'sounds/sfx_impacts/explosion_missile_01.ogg',

    // 战术地图与战机指令音效
    map_open: 'sounds/sfx_interface/ui_command_select_command_ui_icon.ogg',
    map_close: 'sounds/sfx_interface/ui_command_select_command_ui_icon.ogg',
    radar_ping: 'sounds/sfx_interface/ui_radar_detect_vessel.ogg',
    fighter_recall: 'sounds/sfx_interface/fighter_recall_activate.ogg',
    fighter_deploy: 'sounds/sfx_interface/fighter_recall_deactivate.ogg',
    command_engage: 'sounds/sfx_interface/ui_command_right_click_command_given.ogg',
    command_waypoint: 'sounds/sfx_interface/ui_command_create_waypoint.ogg',
    command_refund: 'sounds/sfx_interface/ui_command_refund_command_point.ogg',
    command_out_of_cp: 'sounds/sfx_interface/ui_command_out_of_command_points.ogg',
    command_deselect: 'sounds/sfx_interface/ui_command_selection_cleared.ogg',

    // 小行星撞击与鱼雷
    collision_asteroid_ship: 'sounds/sfx_impacts/collision_ship_vs_asteroid_01.ogg',
    collision_asteroid_asteroid: 'sounds/sfx_impacts/collision_asteroid_vs_asteroid_01.ogg',
    fighter_explosion: 'sounds/sfx_impacts/explosion_03_fighter.ogg',
    atropos_fire: 'sounds/sfx_wpn_missiles/annihilator_fire_01.ogg',

    // 引擎熄火故障与通讯日志
    engine_flameout: 'sounds/sfx_systems/combat_readiness_malfunctions_engine_01.ogg',
    flameout_alarm: 'sounds/sfx_interface/combat_readiness_malfunctions_alarm_flagship_01.ogg',
    comm_radio: 'sounds/sfx_interface/ui_channel_comm_local_01.ogg',
    comm_static: 'sounds/sfx_interface/ui_static01.ogg',

    // 装甲实弹撞击、光束融蚀、次生殉爆与EMP放电
    armor_hit_heavy: 'sounds/sfx_impacts/gun_hit_heavy_01.ogg',
    armor_hit_solid: 'sounds/sfx_impacts/gun_hit_solid_01.ogg',
    armor_hit_light: 'sounds/sfx_impacts/gun_hit_light_01.ogg',
    beam_hit: 'sounds/sfx_impacts/beam_hit_01.ogg',
    explosion_secondary: 'sounds/sfx_impacts/explosion_secondary_01.ogg',
    emp_discharge: 'sounds/sfx_impacts/voltaic_discharge_impact_01.ogg',
    tachyon_lance_emp_impact_01: 'sounds/sfx_systems/emp_emitter_impact_01.ogg',
    tachyon_lance_emp_impact_02: 'sounds/sfx_systems/emp_emitter_impact_02.ogg',
    tachyon_lance_emp_impact_03: 'sounds/sfx_systems/emp_emitter_impact_03.ogg',
    emp_impact: 'sounds/sfx_systems/emp_emitter_impact_01.ogg',
    disabled_large: 'sounds/sfx_systems/disabled_large.ogg',
    disabled_medium: 'sounds/sfx_systems/disabled_medium.ogg',
    disabled_small: 'sounds/sfx_systems/disabled_small.ogg',
    ui_button_press: 'sounds/sfx_interface/ui_button_pressed.ogg',
    weapon_malfunction_large: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_large_01.ogg',
    weapon_malfunction_medium: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_medium_01.ogg',
    weapon_malfunction_small: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_small_01.ogg',
    ...Object.fromEntries(Object.entries(nativeWeaponSounds).flatMap(([key, variants]) =>
      [[key, variants[0].file], ...variants.map((variant, index) => [key + '@' + index, variant.file])]))
  };

let bankRevision = 0;
export function soundBankRevision(): number { return bankRevision; }
export const soundPaths: Readonly<Record<string,string>> = paths;
export function soundVariants(key: string): readonly SoundSample[] | undefined { return nativeWeaponSounds[key]; }
export function requireSound(key: string, requireAssets: boolean): void {
  if (!Object.hasOwn(paths, key)) throw new Error('Unregistered sound: ' + key);
  if (requireAssets) for (const sample of nativeWeaponSounds[key] ?? [{file:paths[key]}]) {
    if (!assetManager.isLoaded || !assetManager.hasPath(sample.file)) throw new Error('Unbundled sound asset: ' + sample.file);
  }
}
/** Call at application composition time, before registering content which references these keys. */
export function registerSoundBank(bank: Record<string, SoundSample[]>, requireAssets = true): void {
  const copy = immutableCopy(structuredClone(bank));
  for (const [key, samples] of Object.entries(copy)) {
    if (!key.trim() || ['__proto__','constructor','prototype'].includes(key) || key.includes('@') || Object.hasOwn(paths,key)) throw new Error('Invalid/duplicate sound key: ' + key);
    if (!Array.isArray(samples) || !samples.length) throw new Error('Empty sound: ' + key);
    for (const sample of samples) {
      if (typeof sample.file !== 'string' || !sample.file.trim() || !Number.isFinite(sample.pitch) || sample.pitch <= 0 || !Number.isFinite(sample.volume) || sample.volume < 0) throw new Error('Invalid sound sample: ' + key);
      if (requireAssets && (!assetManager.isLoaded || !assetManager.hasPath(sample.file))) throw new Error('Unbundled sound asset: ' + sample.file);
    }
  }
  for (const [key, samples] of Object.entries(copy)) {
    nativeWeaponSounds[key] = samples; paths[key] = samples[0].file;
    samples.forEach((sample,index)=>{paths[key+'@'+index]=sample.file;});
  }
  bankRevision++;
}
