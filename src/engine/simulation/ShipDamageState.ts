import type { ArmorGrid } from './ArmorGrid';
import type { SimulationRandom } from './SimulationRandom';
import type { Vector2 } from '../math/Vector2';

export type DamageDecalKind = 'cracks' | 'burns' | 'holes';

/** Native UV rows run bottom-up: burns .25, cracks .5625, holes .1875. */
export function selectDamageDecalKind(firstRoll: number, secondRoll: number): DamageDecalKind {
  return secondRoll > 0.75 ? 'burns' : firstRoll > 0.75 ? 'holes' : 'cracks';
}

export interface ScorchMark {
  cellIndex: number;
  localPos: Vector2;
  opacity: number;
  /** Pulsed heat plus electrical flicker, normalized for rendering. */
  intensity: number;
  heat: number;
  justHit: boolean;
  flash: number;
  flashElapsed: number;
  phase: number;
  pulsePeriod: number;
  size: number;
  rotationRad: number;
  kind: DamageDecalKind;
  variant: 0 | 1;
}

/** damage/String, OOoO and _void: one persistent decal per interior armor cell. */
export class ShipDamageState {
  public readonly marks: ScorchMark[] = [];
  public revision = 0;
  public suppressed = false;
  private readonly cells = new Map<number, ScorchMark>();
  private armorRevision = -1;

  constructor(private readonly armor: ArmorGrid, private readonly random: SimulationRandom) {}

  public onCellDamage(c: number, r: number, damage: number): void {
    if (this.suppressed || c < 2 || r < 2 || c >= this.armor.cols - 2 || r >= this.armor.rows - 2) return;
    const fraction = Math.max(0, Math.min(1, this.armor.getCell(c, r) / this.armor.maxCellArmor));
    const cellIndex = r * this.armor.cols + c;
    let mark = this.cells.get(cellIndex);
    if (!mark && fraction < 0.9) {
      const kind = selectDamageDecalKind(this.random.next(), this.random.next());
      const variant = this.random.next() > 0.5 ? 0 : 1;
      const rotationRad = this.random.next() * Math.PI * 2;
      const size = Math.max(this.armor.cellWidth * 1.5, 40) * (1 + 0.5 * this.random.next());
      mark = { cellIndex, localPos: this.armor.getCellCenterLocal(c, r), opacity: 0, intensity: 0,
        heat: 0, justHit: false, flash: 0, flashElapsed: 0, phase: 0,
        pulsePeriod: 0.25 + 0.75 * this.random.next(), size, rotationRad, kind, variant };
      this.cells.set(cellIndex, mark);
      this.marks.push(mark);
      this.revision++;
    }
    if (!mark) return;
    const opacity = 1 - fraction;
    if (mark.opacity !== opacity) { mark.opacity = opacity; this.revision++; }
    // Use distributed cell damage, including overflow, not aggregate armor loss per hit.
    if (damage > 0) {
      mark.heat = Math.min(255, mark.heat + 255 * damage / this.armor.maxCellArmor * 2.5);
      mark.justHit = true;
    }
    this.updateIntensity(mark);
  }

  /** Explicit zero-damage sync changes opacity without inventing a hot impact. */
  public syncWithArmorGridState(): void {
    if (this.suppressed || this.armorRevision === this.armor.dirtyVersion) return;
    for (let c = 2; c < this.armor.cols - 2; c++) {
      for (let r = 2; r < this.armor.rows - 2; r++) this.onCellDamage(c, r, 0);
    }
    this.armorRevision = this.armor.dirtyVersion;
  }

  public advance(dt: number, hullFraction: number): void {
    this.syncWithArmorGridState();
    const health = Math.max(0, Math.min(1, hullFraction));
    for (const mark of this.marks) {
      const factor = health * mark.opacity;
      mark.flashElapsed += dt;
      const interval = 0.325 * factor + 0.175;
      if (mark.flashElapsed >= interval) {
        mark.flashElapsed -= interval;
        if (this.random.next() < 0.03) mark.flash = Math.min(255, mark.flash + 100 + 155 * this.random.next() * (1 - factor));
      } else {
        mark.flash = Math.max(0, mark.flash - 1000 * dt);
      }
      if (!mark.justHit) mark.heat = Math.max(0, mark.heat - 20 * dt);
      mark.phase = (mark.phase + dt * (2 - health) / mark.pulsePeriod) % (Math.PI * 2);
      mark.justHit = false;
      this.updateIntensity(mark);
    }
  }

  private updateIntensity(mark: ScorchMark): void {
    mark.intensity = Math.min(255, (mark.heat + mark.flash) * (0.9 + 0.1 * Math.sin(mark.phase))) / 255;
  }
}
