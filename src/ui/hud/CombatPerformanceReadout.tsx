
/** Common formatting for measured rates in local and multiplayer combat. */
export function CombatPerformanceReadout({ fps, combatRate, logicHz, motionHz, snapshotHz, paused = false }: {
  fps: number | null;
  combatRate: number | null;
  logicHz?: number | null;
  motionHz?: number | null;
  snapshotHz?: number | null;
  paused?: boolean;
}) {
  const rate = (value: number | null | undefined, digits = 0) =>
    value === null || value === undefined || !Number.isFinite(value) ? '测量中' : value.toFixed(digits);
  return <>
    <span data-combat-fps>画面 {fps === null ? '测量中' : rate(fps) + ' FPS'}</span>
    {logicHz !== undefined && <span data-combat-logic> · 逻辑 {paused ? '暂停' : rate(logicHz) + (logicHz === null ? '' : ' Hz')}</span>}
    {motionHz !== undefined && motionHz !== null && <span> · 关键 {rate(motionHz)} Hz</span>}
    {snapshotHz !== undefined && <span> · 完整 {rate(snapshotHz)} Hz</span>}
    <span data-combat-rate> · 战斗 {paused ? '暂停' : rate(combatRate, 2) + (combatRate === null ? '' : '×')}</span>
  </>;
}
