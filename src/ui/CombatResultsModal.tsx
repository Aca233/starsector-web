import React from 'react';
import type { BattleResult } from '../engine/simulation/CombatStatistics';
import { Button, Keycap, Modal, Section } from './core/UI';
import { Readout } from './core/ShipPreview';

export interface CombatResultsModalProps { shipActionLabel?:string; battleResult: BattleResult; onRestart: () => void; onOpenModManager: () => void; onClose: () => void; gameMode?: 'sandbox' | 'fleet'; onOpenGameState?: () => void }
const count = (value: number) => Math.round(value).toLocaleString();
export const CombatResultsModal: React.FC<CombatResultsModalProps> = ({ battleResult, onRestart, onOpenModManager, onClose, gameMode, onOpenGameState, shipActionLabel }) => {
  const { isVictory, combatDuration, playerStats: stats } = battleResult;
  const damage = [
    { label: '动能', value: stats.kineticDamage, color: '#82bbed' },
    { label: '高爆', value: stats.heDamage, color: 'var(--ui-warning)' },
    { label: '能量', value: stats.energyDamage, color: 'var(--ui-accent)' },
    { label: '破片', value: stats.fragDamage, color: 'var(--ui-muted)' }
  ];
  return <Modal title="战斗结算" eyebrow="战术记录" onClose={onClose}
    onShortcut={key => { if (key === 'r' && gameMode !== 'fleet') onRestart(); if (key === 'm') onOpenModManager(); }}
    footer={<>
      <Button size="sm" className="ui-footer-start" variant="ghost" onClick={onClose}>观察战场<Keycap>Esc</Keycap></Button>
      <Button size="sm" onClick={onOpenModManager}>{shipActionLabel ?? '切换舰船'}<Keycap>M</Keycap></Button>
      {gameMode === 'fleet' && onOpenGameState ? <Button size="sm" variant="primary" onClick={onOpenGameState}>返回舰队</Button> : <Button size="sm" variant="primary" onClick={onRestart}>重新开始<Keycap>R</Keycap></Button>}
    </>}>
    <div className="native-report-summary">
      <strong className={isVictory ? 'ui-tone--success' : 'ui-tone--danger'}>{isVictory ? '战斗胜利' : '战斗失败'}</strong>
      <span className="ui-caption">{isVictory ? '敌方主力已摧毁' : '我方主力已损失'}</span>
      <span>交战 {combatDuration.toFixed(1)} 秒</span>
    </div>
    <div className="native-report">
      <Section title="火力输出" meta={<span className="ui-caption">总伤害 {count(stats.totalDamageDealt)}</span>}>
        <div className="ui-damage-bar" aria-hidden="true">{damage.map(item => <span key={item.label} style={{ width: (100 * item.value / Math.max(1, stats.totalDamageDealt)) + '%', background: item.color }} />)}</div>
        {damage.map(item => <Readout key={item.label} label={item.label} value={count(item.value)} />)}
      </Section>
      <Section title="防御与抗损">
        <Readout label="护盾吸收" value={count(stats.shieldDamageAbsorbed)} /><Readout label="装甲吸收" value={count(stats.armorDamageSoaked)} /><Readout label="结构损伤" value={<span className="ui-tone--danger">{count(stats.hullDamageTaken)}</span>} />
      </Section>
      <Section title="压制与过载">
        <Readout label="迫使敌舰过载" value={count(stats.overloadsInflicted) + ' 次'} /><Readout label="自身过载" value={count(stats.overloadsSuffered) + ' 次'} /><Readout label="EMP 损伤" value={count(stats.empDamageDealt)} />
      </Section>
      <Section title="防空与舰载机">
        <Readout label="拦截导弹" value={count(stats.missilesIntercepted) + ' 枚'} /><Readout label="击落敌机" value={count(stats.fightersDestroyed) + ' 架'} /><Readout label="友机损失" value={count(stats.fightersLost) + ' 架'} /><Readout label="机库重构" value={count(stats.fightersRebuilt) + ' 架'} />
      </Section>
    </div>
  </Modal>;
};
