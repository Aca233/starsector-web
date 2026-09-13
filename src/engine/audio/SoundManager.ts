/**
 * 远行星号原生音频引擎 (Web Audio API 原版音效直接流式解码)
 * 从应用内置 /game-assets/sounds/ 资源包加载 .ogg 音效，
 * 还原 TPC 重炮轰鸣、速子长矛电弧裂解、冲刺推进喷射与能量护盾偏振音效。
 */
import { assetResolver } from '../assets/AssetResolver';

export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isMuted = false;

  // 循环音效源 (冲刺推进 / 堡垒护盾 / 战役背景乐)
  private loopingSources: Map<string, AudioBufferSourceNode> = new Map();
  private lastPlayTimes: Map<string, number> = new Map();

  // 官方音效资源映射表
  public readonly SOUND_MAP: Record<string, string> = {
    // 武器开火
    tpc_fire: 'sounds/sfx_wpn_energy/thermal_pulse_cannon_fire_01.ogg',
    tachyon_fire: 'sounds/sfx_wpn_energy/tachyon_lance_fire_01.ogg',
    autopulse_fire: 'sounds/sfx_wpn_energy/autopulse_laser_fire_01.ogg',
    mark9_fire: 'sounds/sfx_wpn_guns/autocannon_fire_01.ogg',
    mauler_fire: 'sounds/sfx_wpn_guns/mauler_fire_01.ogg',
    hveldriver_fire: 'sounds/sfx_wpn_guns/hypervel_driver_fire_01.ogg',
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
    mine_windup: 'sounds/sfx_systems/mine_strike_windup_01.ogg',
    mine_explosion: 'sounds/sfx_systems/mine_strike_explosion_01.ogg',

    // 新增武器音效
    heavyblaster_fire: 'sounds/sfx_wpn_energy/autopulse_laser_fire_01.ogg',
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
    emp_impact: 'sounds/sfx_systems/emp_emitter_impact_01.ogg',
    disabled_large: 'sounds/sfx_systems/disabled_large.ogg',
    ui_button_press: 'sounds/sfx_interface/ui_button_pressed.ogg',
    weapon_malfunction_large: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_large_01.ogg',
    weapon_malfunction_medium: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_medium_01.ogg',
    weapon_malfunction_small: 'sounds/sfx_systems/combat_readiness_malfunctions_weapon_small_01.ogg'
  };

  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private isMuffled = false;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initContext() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // 创建主混音总线与动态低通滤波 (用于过载/排能低沉静默音效)
        this.masterGain = this.ctx.createGain();
        this.masterFilter = this.ctx.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 22000; // 默认全频放开
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public async preloadSounds() {
    this.initContext();
    const loadPromises = Object.entries(this.SOUND_MAP).map(async ([key, relPath]) => {
      try {
        const res = await fetch(assetResolver.url(relPath));
        if (!res.ok) return;
        const arrayBuffer = await res.arrayBuffer();
        if (this.ctx) {
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.audioBuffers.set(key, audioBuffer);
        }
      } catch (e) {
        console.warn(`Failed to preload sound: ${key}`, e);
      }
    });
    await Promise.all(loadPromises);
  }

  /**
   * 播放单次原版音效
   */
  public play(key: string, volume = 0.8, playbackRate = 1.0) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const buffer = this.audioBuffers.get(key);
    if (!buffer) {
      // 延迟静默拉取
      this.fetchAndPlay(key, volume, playbackRate);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate * (0.95 + Math.random() * 0.1); // 微小音高晃动，还原真实枪炮多样感

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    if (this.masterGain) {
      gainNode.connect(this.masterGain);
    } else {
      gainNode.connect(this.ctx.destination);
    }
    source.start(0);
  }

  /**
   * 空间立体双声道定位音效 (严格对齐 SoundPlayer.java)
   * 根据声源与摄像机中心在屏幕横向位置进行立体声左右平移 (-1.0 左声道 ~ +1.0 右声道)，并进行指数距离衰减
   */
  public playAtPos(
    key: string,
    worldPos: { x: number; y: number },
    listenerPos: { x: number; y: number },
    volume = 0.8,
    playbackRate = 1.0,
    maxDist = 2800
  ) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const buffer = this.audioBuffers.get(key);
    if (!buffer) {
      this.fetchAndPlay(key, volume, playbackRate);
      return;
    }

    const dx = worldPos.x - listenerPos.x;
    const dy = worldPos.y - listenerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) return; // 超出听觉范围

    const attenuation = Math.max(0.05, 1.0 - dist / maxDist);
    const finalVolume = volume * attenuation;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate * (0.95 + Math.random() * 0.1);

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = finalVolume;

    // 立体声平移 (StereoPanner)
    if (typeof (this.ctx as any).createStereoPanner === 'function') {
      const panner = (this.ctx as any).createStereoPanner() as StereoPannerNode;
      const pan = Math.max(-1.0, Math.min(1.0, dx / 1200));
      panner.pan.value = pan;
      source.connect(panner);
      panner.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    if (this.masterGain) {
      gainNode.connect(this.masterGain);
    } else {
      gainNode.connect(this.ctx.destination);
    }
    source.start(0);
  }

  /**
   * 带最小时间间隔节流的音效播放 (防止 EMP 电弧、近防机枪等高频音效堆叠失真)
   */
  public playThrottled(key: string, intervalSeconds = 0.08, volume = 0.8, playbackRate = 1.0) {
    if (!this.ctx) {
      this.initContext();
    }
    const now = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    const last = this.lastPlayTimes.get(key) || 0;
    if (now - last < intervalSeconds) return;
    this.lastPlayTimes.set(key, now);
    this.play(key, volume, playbackRate);
  }

  /**
   * 设置过载/主动排能沉浸窒息滤波 (Lowpass Filter Muffling)
   * 严格对齐原版过载时低通滤波 600-800Hz
   */
  public setMuffled(muffled: boolean) {
    if (!this.ctx || !this.masterFilter) return;
    if (this.isMuffled === muffled) return;
    this.isMuffled = muffled;

    const targetFreq = muffled ? 750 : 22000;
    const duration = muffled ? 0.12 : 0.25;
    try {
      this.masterFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, duration);
    } catch {
      this.masterFilter.frequency.value = targetFreq;
    }
  }

  private async fetchAndPlay(key: string, volume: number, playbackRate: number) {
    const relPath = this.SOUND_MAP[key];
    if (!relPath || !this.ctx) return;
    try {
      const res = await fetch(assetResolver.url(relPath));
      if (!res.ok) return;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(key, buffer);
      this.play(key, volume, playbackRate);
    } catch {
      // ignore
    }
  }

  /**
   * 播放循环音效 (如冲刺推进持续轰鸣 / 堡垒护盾蜂鸣)
   */
  public startLoop(key: string, volume = 0.6) {
    if (this.isMuted || this.loopingSources.has(key)) return;
    this.initContext();
    if (!this.ctx) return;

    const buffer = this.audioBuffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    if (this.masterGain) {
      gainNode.connect(this.masterGain);
    } else {
      gainNode.connect(this.ctx.destination);
    }
    source.start(0);

    this.loopingSources.set(key, source);
  }

  public stopLoop(key: string) {
    const source = this.loopingSources.get(key);
    if (source) {
      try {
        source.stop();
      } catch {
        // ignore
      }
      this.loopingSources.delete(key);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
}

export const sound = SoundManager.getInstance();
