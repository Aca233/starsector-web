import type { Beam } from '../simulation/Weapon';

/**
 * 持续光束的模拟实体目前可能因 refire/lifetime 重叠而同时存在多条。
 * 这里只合并“要画的 Beam”，不删除模拟实体、不改变伤害、幅能或命中判定。
 */
export function selectRenderableBeams(beams: readonly Beam[]): Beam[] {
  const selected: Beam[] = [];
  const sustainedIndex = new Map<string, number>();

  for (const beam of beams) {
    if (beam.visualMode !== 'SUSTAINED' || !beam.slotId) {
      selected.push(beam);
      continue;
    }

    const key = `${beam.sourceShipId}|${beam.slotId}|${beam.specId}`;
    const existing = sustainedIndex.get(key);
    if (existing === undefined) {
      sustainedIndex.set(key, selected.length);
      selected.push(beam);
    } else {
      // BeamSimulation 保持所有重叠实体；渲染只保留同槽位最新生成的一条，避免亮度叠乘。
      selected[existing] = beam;
    }
  }

  return selected;
}

export function beamVisualTime(beam: Beam, combatTime: number): number {
  // 持续光束不能随每个新 Beam 实体重置 UV 相位。
  return beam.visualMode === 'SUSTAINED' ? combatTime : beam.elapsedTime;
}
