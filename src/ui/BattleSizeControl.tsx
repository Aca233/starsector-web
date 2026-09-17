import { useState } from 'react';
import { BATTLE_SIZE_PRESETS, BATTLE_SIZE_STEP, MIN_BATTLE_SIZE, MAX_BATTLE_SIZE, battleTeamLimit } from '../shared/battle-size.mjs';
import { readBattleSize, saveBattleSize } from '../engine/runtime/BattleSizeSettings';
import './battle-size.css';

export function BattleSizeControl({ value, onChange, disabled = false, teams = 2 }: {
  value: number; onChange: (value: number) => void; disabled?: boolean; teams?: number;
}) {
  return <section className="battle-size-control" aria-label="战斗规模设置">
    <h3>战斗规模（最大在场规模）</h3>
    <label><span>全战场部署点</span><select aria-label="战斗规模" value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>
      {[...new Set([...BATTLE_SIZE_PRESETS, value])].sort((a,b)=>a-b).map(size => <option key={size} value={size}>{size} DP{size === 400 ? ' · 原版默认' : size > 400 ? ' · 扩展' : ''}</option>)}
    </select></label>
    <input aria-label="调整战斗规模" type="range" min={MIN_BATTLE_SIZE} max={MAX_BATTLE_SIZE} step={BATTLE_SIZE_STEP} value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))}/>
    <p className="battle-size-budget">{teams} 个参战阵营 · 每队最多 {battleTeamLimit(value, teams)} DP 同时在场</p>
    <p>这是部署点上限，不是舰船艘数上限。舰船越大，通常占用越多 DP；超额 AI 留作后备，不会从编成中删除。</p>
    <p>原版设置为 200–400 DP；这里按参战队伍均分，不复刻战役中的非对称分配。空队不占额度，战斗中额度固定。</p>
    {value > 400 && <p className="battle-size-warning">扩展规模：越高越吃房主计算性能，也会增加客机渲染与网络负担。</p>}
  </section>;
}

export function LocalBattleSizeSettings() {
  const [value, setValue] = useState(readBattleSize);
  const [saved, setSaved] = useState(true);
  return <><BattleSizeControl value={value} onChange={next=>{setValue(next);setSaved(saveBattleSize(next));}}/>
    <p className="battle-size-note" role="status">{saved ? '自动保存。' : '浏览器无法保存，仅本次会话有效。'}用于下一次模拟、舰队出击和创建房间；不改动当前战斗。加入别人的房间时，以房主的房间规则为准。</p></>;
}
