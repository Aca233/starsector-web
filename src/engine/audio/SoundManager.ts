/**
 * 远行星号原生音频引擎 (Web Audio API 原版音效直接流式解码)
 * 从应用内置 /game-assets/sounds/ 资源包加载 .ogg 音效，
 * 还原 TPC 重炮轰鸣、速子长矛电弧裂解、冲刺推进喷射与能量护盾偏振音效。
 */
import { assetResolver } from '../assets/AssetResolver';
import { soundPaths, soundVariants, soundBankRevision } from './SoundBank';
import { getAudioSettings, subscribeAudioSettings, updateAudioSettings, type AudioChannel } from './AudioSettings';
type SoundVariant = { bufferKey: string; pitch: number; volume: number };

export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isMuted = false;
  private preloadedRevision = -1;
  private preloadPromise: Promise<void> | null = null;
  private loadingBuffers: Map<string, Promise<AudioBuffer | null>> = new Map();

  // 循环音效源 (冲刺推进 / 堡垒护盾)
  private sampleLoads = new Map<string, Promise<AudioBuffer | null>>();
  private loopingSources: Map<string, AudioBufferSourceNode> = new Map();
  private lastPlayTimes: Map<string, number> = new Map();

  // 官方音效资源映射表
  public readonly SOUND_MAP = soundPaths;

  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private isMuffled = false;
  private channelGains: Partial<Record<AudioChannel, GainNode>> = {};

  private constructor() {
    subscribeAudioSettings(() => this.applyMixerSettings());
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.applyMixerSettings());
  }

  /** Route imported/mod sounds using their actual sample path, not a fragile key allowlist. */
  private channelFor(key: string): AudioChannel {
    return /(?:^|[\\/])sfx_interface[\\/]/i.test(this.SOUND_MAP[key] ?? '') ? 'interface' : 'effects';
  }

  private outputMuted(): boolean {
    const settings = getAudioSettings();
    return this.getMuted() || (settings.muteInBackground && typeof document !== 'undefined' && document.hidden);
  }

  private canHear(channel: AudioChannel): boolean {
    const settings = getAudioSettings();
    return !this.outputMuted() && settings.masterVolume > 0 && settings[channel === 'effects' ? 'effectsVolume' : 'interfaceVolume'] > 0;
  }

  private applyMixerSettings(immediate = false): void {
    if (!this.ctx || !this.masterGain) return;
    const settings = getAudioSettings();
    const set = (node: GainNode | undefined, value: number) => {
      if (!node) return;
      if (immediate) node.gain.value = value;
      else node.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.015);
    };
    set(this.masterGain, this.outputMuted() ? 0 : settings.masterVolume);
    set(this.channelGains.effects, settings.effectsVolume);
    set(this.channelGains.interface, settings.interfaceVolume);
  }

  /** Select actual sounds.json variants, not generic pitch jitter or substitute samples. */
  private shotVariant(key: string): SoundVariant {
    const variants = soundVariants(key);
    if (!variants?.length) return { bufferKey: key, pitch: .95 + Math.random() * .1, volume: 1 };
    const index = Math.floor(Math.random() * variants.length);
    return { bufferKey: key + '@' + index, pitch: variants[index].pitch, volume: variants[index].volume };
  }

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
        this.channelGains.effects = this.ctx.createGain();
        this.channelGains.interface = this.ctx.createGain();
        this.masterFilter = this.ctx.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 22000; // 默认全频放开
        // Only combat effects are muffled; UI warnings remain intelligible.
        this.channelGains.effects.connect(this.masterFilter);
        this.masterFilter.connect(this.masterGain);
        this.channelGains.interface.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.applyMixerSettings(true);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => { /* Retry at the next user gesture. */ });
    }
  }

  public preloadSounds(): Promise<void> {
    this.initContext();
    if (this.preloadedRevision === soundBankRevision()) return Promise.resolve();
    if (this.preloadPromise) return this.preloadPromise;
    const revision = soundBankRevision();
    this.preloadPromise = Promise.all(
      Object.entries(this.SOUND_MAP).map(([key, relPath]) => this.loadBuffer(key, relPath))
    ).then(() => {
      this.preloadedRevision = revision;
    }).finally(() => {
      this.preloadPromise = null;
    });
    return this.preloadPromise;
  }

  private loadBuffer(key: string, relPath: string): Promise<AudioBuffer | null> {
    const existing = this.audioBuffers.get(key);
    if (existing) return Promise.resolve(existing);
    const inFlight = this.loadingBuffers.get(key);
    if (inFlight) return inFlight;
    if (!this.ctx) return Promise.resolve(null);
    const shared = this.sampleLoads.get(relPath);
    if (shared) return shared.then(buffer => { if (buffer) this.audioBuffers.set(key, buffer); return buffer; });
    const ctx = this.ctx;
    const request = (async () => {
      try {
        const res = await fetch(assetResolver.url(relPath));
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(key, audioBuffer);
        return audioBuffer;
      } catch (e) {
        console.warn(`Failed to load sound: ${key}`, e);
        return null;
      } finally {
        this.loadingBuffers.delete(key);
      }
    })();
    this.sampleLoads.set(relPath, request);
    void request.then(buffer => { if (!buffer) this.sampleLoads.delete(relPath); });
    this.loadingBuffers.set(key, request);
    return request;
  }

  /**
   * 播放单次原版音效
   */
  public play(key: string, volume = 0.8, playbackRate = 1.0) {
    this.playOneShot(key, volume, playbackRate);
  }

  public playAtPos(key: string, worldPos: { x: number; y: number },
    listenerPos: { x: number; y: number }, volume = 0.8, playbackRate = 1.0, maxDist = 2800) {
    const dx = worldPos.x - listenerPos.x;
    const distance = Math.hypot(dx, worldPos.y - listenerPos.y);
    if (distance > maxDist) return;
    this.playOneShot(key, volume * Math.max(.05, 1 - distance / maxDist), playbackRate,
      Math.max(-1, Math.min(1, dx / 1200)));
  }

  private playOneShot(key: string, volume: number, playbackRate: number, pan?: number) {
    const channel = this.channelFor(key);
    if (!this.canHear(channel)) return;
    this.initContext();
    if (!this.ctx) return;
    const variant = this.shotVariant(key);
    const emit = (buffer: AudioBuffer | null) => {
      if (!buffer || !this.ctx || !this.canHear(channel)) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate * variant.pitch;
      const gain = this.ctx.createGain();
      gain.gain.value = volume * variant.volume;
      let panner: StereoPannerNode | undefined;
      if (pan !== undefined && this.ctx.createStereoPanner) {
        panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        source.connect(panner);
        panner.connect(gain);
      } else source.connect(gain);
      gain.connect(this.channelGains[channel] ?? this.ctx.destination);
      source.onended = () => { source.disconnect(); panner?.disconnect(); gain.disconnect(); };
      source.start(0);
    };
    const buffer = this.audioBuffers.get(variant.bufferKey);
    if (buffer) emit(buffer);
    else if (this.SOUND_MAP[variant.bufferKey]) {
      // Keep both the selected variant and positional attenuation after async loading.
      void this.loadBuffer(variant.bufferKey, this.SOUND_MAP[variant.bufferKey]).then(emit);
    }
  }

  public playThrottled(key: string, intervalSeconds = 0.08, volume = 0.8, playbackRate = 1.0) {
    if (!this.ctx) {
      this.initContext();
    }
    const now = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    const last = this.lastPlayTimes.get(key);
    if (last !== undefined && now - last < intervalSeconds) return;
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

  /**
   * 播放循环音效 (如冲刺推进持续轰鸣 / 堡垒护盾蜂鸣)
   */
  public startLoop(key: string, volume = 0.6) {
    // Keep loop transport alive while silent, so unmuting never loses a sustained sound.
    if (this.loopingSources.has(key)) return;
    this.initContext();
    if (!this.ctx) return;

    const variant = this.shotVariant(key);
    const buffer = this.audioBuffers.get(variant.bufferKey);
    if (!buffer) {
      if (this.SOUND_MAP[variant.bufferKey]) void this.loadBuffer(variant.bufferKey, this.SOUND_MAP[variant.bufferKey]);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = soundVariants(key) ? variant.pitch : 1;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume * (soundVariants(key) ? variant.volume : 1);

    source.connect(gainNode);
    gainNode.connect(this.channelGains[this.channelFor(key)] ?? this.ctx.destination);
    source.onended = () => { source.disconnect(); gainNode.disconnect(); };
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

  /** Preview real samples through the same buses as gameplay; never bypass user mute. */
  public async preview(channel: AudioChannel): Promise<boolean> {
    if (!this.canHear(channel)) return false;
    this.initContext();
    if (!this.ctx) return false;
    const key = channel === 'interface' ? 'ui_button_press' : 'heavyblaster_fire';
    const buffer = await this.loadBuffer(key, this.SOUND_MAP[key]);
    if (!buffer || !this.canHear(channel) || this.ctx.state !== 'running') return false;
    this.play(key, 0.65, 1);
    return true;
  }

  public getMuted(): boolean { return this.isMuted || getAudioSettings().muted; }

  /** Runtime override for silent simulation workers; does not overwrite user preferences. */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyMixerSettings();
  }

  public toggleMute(): boolean {
    const muted = !this.getMuted();
    this.isMuted = false;
    updateAudioSettings({ muted });
    this.applyMixerSettings();
    return muted;
  }
}

export const sound = SoundManager.getInstance();
