import { useEffect, useState } from 'react';
import type { CombatSession } from '../../engine/runtime/CombatSession';
import { CombatPerformanceReadout } from './CombatPerformanceReadout';

type Rates = { fps: number | null; logicHz: number | null; combatRate: number | null };
const pending: Rates = { fps: null, logicHz: null, combatRate: null };

/** Display-only sampling works with both local Worker and inline authority. */
export function LocalCombatStatus({ session, simulation, paused }: {
  session: CombatSession; simulation: boolean; paused: boolean;
}) {
  const [sample, setSample] = useState<Rates & { pauseState: boolean }>({ ...pending, pauseState: paused });
  const rates = sample.pauseState === paused ? sample : pending;
  const [, refreshRoster] = useState(0);
  useEffect(() => {
    const counters = () => ({ at: performance.now(), frames: session.renderedFrames,
      ticks: session.scheduler.simTicks, combatTime: session.read.combatTime,
      running: session.state === 'running' && session.isPresentationReady(), visible: document.visibilityState === 'visible' });
    let previous = counters();
    const reset = () => { previous = counters(); setSample({ ...pending, pauseState: paused }); };
    const timer = window.setInterval(() => {
      const current = counters(), elapsed = (current.at - previous.at) / 1000;
      const continuous = current.visible && previous.visible && elapsed > 0 && elapsed < 2.5
        && current.frames >= previous.frames && current.ticks >= previous.ticks && current.combatTime >= previous.combatTime;
      setSample({ pauseState: paused, ...(continuous ? {
        fps: (current.frames - previous.frames) / elapsed,
        logicHz: current.running && previous.running ? (current.ticks - previous.ticks) / elapsed : null,
        combatRate: current.running && previous.running ? (current.combatTime - previous.combatTime) / elapsed : null
      } : pending) });
      previous = current;
      refreshRoster(value => value + 1);
    }, 500);
    document.addEventListener('visibilitychange', reset);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', reset); };
  }, [session, paused]);

  const view = session.deploymentView.read();
  // A simulator has no fleet reserve ledger. Use actual capital-ship contacts
  // there, rather than interpreting an empty deployment ledger as zero ships.
  const roster = view.fleetEnabled ? view.members : session.read.capitalShips.map(ship => ({
    teamId: ship.teamId,
    status: ship.isDead || ship.hullHp <= 0 ? 'destroyed' : ship.isRetreated ? 'retreated' : 'deployed'
  }));
  const teams = [...new Set([view.playerTeam, ...roster.map(member => member.teamId)])].sort((a, b) => a - b);
  return <div className="local-combat-status" data-map-open={session.read.isTacticalMap} aria-label="战斗状态与性能">
    <div className="local-combat-teams">
      <span>{simulation ? '模拟战' : '本地战斗'} · 本机计算</span>
      {teams.map(team => {
        const members = roster.filter(member => member.teamId === team);
        const deployed = members.filter(member => member.status === 'deployed' || member.status === 'retreating').length;
        const reserve = members.filter(member => member.status === 'reserve').length;
        return <span key={team} data-team={team} data-deployed={deployed} data-total={view.fleetEnabled ? members.length : undefined} data-reserve={reserve}
          title={(view.fleetEnabled ? '编成 ' + members.length + ' · 后备 ' + reserve + ' · ' : '') + '在场 ' + deployed + '；不含舰载机和舰体模块。'}>
          {team === view.playerTeam ? '己方' : '敌方'} · 场{deployed}{view.fleetEnabled && '/总' + members.length}{reserve > 0 && ' 待命' + reserve}
        </span>;
      })}
    </div>
    <div className="combat-status-metrics" title="画面 FPS 统计实际绘制帧；逻辑 Hz 统计已完成的物理步；战斗倍率统计每现实秒推进的战斗时间。">
      <CombatPerformanceReadout {...rates} paused={paused || session.state !== 'running'} />
    </div>
  </div>;
}
