import { Vector2 } from '../math/Vector2';

export interface ContrailPoint {
  pos: Vector2;
  age: number;
  duration: number;
  baseWidth: number;
  currentWidth: number;
  u: number;
  alpha: number;
}

export interface ContrailStrip {
  stripId: number | string;
  points: ContrailPoint[];
  color: [number, number, number, number]; // RGBA 0-255
  blendMode: 'NORMAL' | 'GLOW';
  widenMult: number;
  minSeg: number;
  isDetached: boolean;
  accumU: number;
}

/**
 * 连续烟雾尾迹带引擎 (1:1 对齐原版 com.fs.starfarer.combat.entities.ContrailEngine.java)
 */
export class ContrailEngine {
  private strips: Map<number | string, ContrailStrip> = new Map();

  public addPoint(
    stripId: number | string,
    pos: Vector2,
    duration = 2.0,
    baseWidth = 8.0,
    widenMult = 2.0,
    minSeg = 8.0,
    color: [number, number, number, number] = [130, 130, 135, 160],
    blendMode: 'NORMAL' | 'GLOW' = 'NORMAL'
  ) {
    let strip = this.strips.get(stripId);
    if (!strip) {
      strip = {
        stripId,
        points: [],
        color,
        blendMode,
        widenMult,
        minSeg,
        isDetached: false,
        accumU: 0
      };
      this.strips.set(stripId, strip);
    }

    if (strip.isDetached) return;

    const n = strip.points.length;
    if (n > 0) {
      const lastPt = strip.points[n - 1];
      const dist = lastPt.pos.distanceTo(pos);
      if (dist < minSeg) return;

      strip.accumU += dist / 256.0;
    }

    strip.points.push({
      pos: pos.clone(),
      age: 0,
      duration,
      baseWidth,
      currentWidth: baseWidth,
      u: strip.accumU,
      alpha: 1.0
    });
  }

  public detach(stripId: number | string) {
    const strip = this.strips.get(stripId);
    if (strip) {
      strip.isDetached = true;
    }
  }

  public update(dt: number) {
    const toDelete: (number | string)[] = [];

    for (const [id, strip] of this.strips) {
      const ageMult = strip.isDetached ? 1.3 : 1.0;
      const stepAge = dt * ageMult;

      for (let i = 0; i < strip.points.length; i++) {
        const pt = strip.points[i];
        pt.age += stepAge;
        if (pt.age > pt.duration) {
          pt.age = pt.duration;
        }

        const progress = pt.age / pt.duration;
        // 末端扩散膨胀
        pt.currentWidth = pt.baseWidth * (1.0 + progress * strip.widenMult);

        // 原版 ContrailEngine 双阶段透明度衰减公式 (前 0.05s 快速淡入，之后平滑淡出)
        const f3 = Math.min(0.5, 0.05 / pt.duration);
        const fade = progress < f3 ? progress / f3 : (1.0 - progress) / (1.0 - f3);
        pt.alpha = Math.max(0, Math.min(1.0, fade));
      }

      // 从头部移除完全失效的点 (两端都超时才移出，保证多边形不闪烁断裂)
      while (strip.points.length >= 2) {
        if (strip.points[0].age >= strip.points[0].duration && strip.points[1].age >= strip.points[1].duration) {
          strip.points.shift();
        } else {
          break;
        }
      }

      if (strip.isDetached && strip.points.length < 2) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.strips.delete(id);
    }
  }

  public getStrips(): IterableIterator<ContrailStrip> {
    return this.strips.values();
  }

  public clear() {
    this.strips.clear();
  }
}
