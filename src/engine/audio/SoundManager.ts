/**
 * 远行星号原生音频引擎 (Web Audio API 原版音效直接流式解码)
 * 从应用内置 /game-assets/sounds/ 资源包加载 .ogg 音效，
 * 还原 TPC 重炮轰鸣、速子长矛电弧裂解、冲刺推进喷射与能量护盾偏振音效。
 */
import { assetResolver } from '../assets/AssetResolver';
import { soundPaths, soundVariants, soundBankRevision } from './SoundBank';
type SoundVariant = { bufferKey: string; pitch: number; volume: number };

export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isMuted = false;
  private preloadedRevision = -1;
  private preloadPromise: Promise<void> | null = null;
  private loadingBuffers: Map<string, Promise<AudioBuffer | null>> = new Map();

  // 循环音效源 (冲刺推进 / 堡垒护盾 / 战役背景乐)
  private sampleLoads = new Map<string, Promise<AudioBuffer | null>>();
  private loopingSources: Map<string, AudioBufferSourceNode> = new Map();
  private lastPlayTimes: Map<string, number> = new Map();

  // 官方音效资源映射表
  public readonly SOUND_MAP = soundPaths;

  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private isMuffled = false;

  private constructor() {}

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
        this.masterGain.gain.value = this.isMuted ? 0 : 1;
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
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    const variant = this.shotVariant(key);
    const emit = (buffer: AudioBuffer | null) => {
      if (!buffer || !this.ctx || this.isMuted) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate * variant.pitch;
      const gain = this.ctx.createGain();
      gain.gain.value = volume * variant.volume;
      if (pan !== undefined && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        source.connect(panner);
        panner.connect(gain);
      } else source.connect(gain);
      gain.connect(this.masterGain ?? this.ctx.destination);
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
    if (this.isMuted || this.loopingSources.has(key)) return;
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

  public getMuted(): boolean { return this.isMuted; }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      } catch {
        this.masterGain.gain.value = this.isMuted ? 0 : 1;
      }
    }
    if (this.isMuted) {
      for (const key of Array.from(this.loopingSources.keys())) this.stopLoop(key);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }
}

export const sound = SoundManager.getInstance();
