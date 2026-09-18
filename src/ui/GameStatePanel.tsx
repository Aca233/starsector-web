import { MotionPresence } from './core/MotionPresence';
import { BattleSizeControl } from './BattleSizeControl';
import { readBattleSize } from '../engine/runtime/BattleSizeSettings';
import { battleTeamLimit } from '../shared/battle-size.mjs';
import React, { useRef, useState } from 'react';
import type { GameSession } from '../engine/game/GameSession';
import { i18n } from '../engine/i18n/LocalizationManager';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { Button, ConfirmDialog, Modal, Notice, type Confirmation } from './core/UI';
import { ConditionBar, Readout, ShipPreview } from './core/ShipPreview';

interface Props { game: GameSession; onClose: () => void; onAction: (action: () => void) => void; actionError?: string | null; onClearError?: () => void }
export function GameStatePanel({ game, onClose, onAction, actionError, onClearError }: Props) {
  const state = game.getSnapshot();
  const activeFleet = state.pendingCombat?.kind === 'fleet';
  const [firstWave,setFirstWave]=useState<string[]>([]);
  const [deploymentLimit,setDeploymentLimit]=useState(()=>battleTeamLimit(readBattleSize()));
  const [selectedId, setSelectedId] = useState(state.fleet[0]?.id);
  const selected = state.fleet.find(member => member.id === selectedId) ?? state.fleet[0];
  const spec = selected && contentRegistry.getShip(selected.hullId);
  const importRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const exportSave = () => {
    const url = URL.createObjectURL(new Blob([game.exportSave()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `starsector-save-${state.gameId}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <Modal title="舰队 / 存档" width="console" onClose={onClose} footer={<>
      <span className="native-statusline">{game.saveStatus.state === 'saved' ? '已保存到此浏览器' : '尚未保存到此浏览器'}</span>
      {game.mode !== 'sandbox' && !activeFleet && <Button size="sm" onClick={() => onAction(() => game.startSandbox())}>自由沙盒</Button>}
      <Button size="sm" onClick={() => importRef.current?.click()}>导入存档</Button>
      <Button size="sm" onClick={exportSave}>导出存档</Button>
      <Button size="sm" onClick={() => setConfirmation({ title: '新建游戏', description: '清除当前舰队的损伤与战果记录，以当前沙盒舰体建立新舰队。', action: () => game.newGame(state.sandboxHullId) })}>新建游戏</Button>
    </>}>
      <div className="native-console">
        <nav className="native-roster" aria-label="长期舰队"><div className="native-roster-heading">舰队 · {state.fleet.length} 艘</div>{state.fleet.map(member => {
          const hull = contentRegistry.getShip(member.hullId);
          return <button className="native-roster-item" key={member.id} type="button" aria-pressed={member.id === selected?.id} onClick={() => setSelectedId(member.id)}>
            {hull && <img src={runtimeAssetUrl(hull.spriteUrl)} alt="" />}<span><strong>{hull ? i18n.t(hull.nameKey).split(' (')[0] : member.hullId}</strong><small>{member.status === 'destroyed' ? '已战沉' : `结构 ${Math.round(member.hullFraction * 100)}%`}</small></span>
          </button>;
        })}</nav>
        {spec ? <ShipPreview spec={spec} /> : <div className="native-ship-stage">未加载舰体</div>}
        <aside className="native-side">
          {(actionError || game.error) && <Notice tone="danger" onDismiss={onClearError}>{actionError || game.error}</Notice>}
          {game.saveStatus.state !== 'saved' && <Notice tone="warning">{game.saveStatus.message}</Notice>}
          {selected && <><h3>舰船状态</h3><ConditionBar label="结构完整度" value={selected.hullFraction} /><ConditionBar label="战备值 CR" value={selected.combatReadiness} kind="cr" />
            <Readout label="装配武器" value={`${selected.weapons.length} 门`} /><Readout label="战斗状态" value={selected.status === 'destroyed' ? '战沉' : activeFleet ? '出击中' : '待命'} />
            {!activeFleet && selected.status === 'ready' && <>
              <h3>出击编成</h3><p>当前选中舰作为旗舰；其余可用舰船默认待命，可勾选为首发。</p>
              <BattleSizeControl value={deploymentLimit*2} onChange={value=>setDeploymentLimit(value/2)}/>
              {state.fleet.filter(m=>m.status==='ready'&&m.id!==selected.id).map(m=><label key={m.id} style={{display:'block'}}><input type="checkbox" checked={firstWave.includes(m.id)} onChange={e=>setFirstWave(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/>{i18n.t(contentRegistry.getShip(m.hullId)?.nameKey??m.hullId)} 首发</label>)}
              <Button variant="primary" onClick={() => onAction(() => game.startFleetCombat([selected.id,...state.fleet.filter(m=>m.status==='ready'&&m.id!==selected.id).map(m=>m.id)],undefined,[selected.id,...firstWave.filter(id=>id!==selected.id&&state.fleet.some(m=>m.id===id&&m.status==='ready'))],deploymentLimit))}>按此编成出击</Button>
            </>}
            {activeFleet && <Button size="sm" onClick={() => onAction(() => game.restartCombat())}>从战前重新开始</Button>}
          </>}
          {state.outcomes.length > 0 && <><h3>最近战果</h3><div className="native-history">{ state.outcomes.slice(-5).reverse().map(outcome => <div key={outcome.encounterId}><strong className={outcome.victory ? '' : 'loss'}>{outcome.victory ? '胜利' : '失败'}</strong> · {outcome.kind === 'fleet' ? '舰队' : '沙盒'}<span style={{ float: 'right' }}>{outcome.duration.toFixed(1)} 秒</span></div>)}</div></>}
          <p className="ui-caption" style={{ marginTop: 16 }}>刷新从战前检查点恢复，不保存战斗中途。沙盒不改变存档舰队；导出可另存为文件。</p>
        </aside>
      </div>
      <input ref={importRef} type="file" accept=".json,application/json" hidden aria-label="选择存档文件" onChange={async event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
        try { const serialized = await file.text(); setConfirmation({ title: '导入存档', description: `使用 ${file.name} 替换当前游戏，从该存档的战前检查点开始。`, action: () => game.importSave(serialized) }); }
        catch { onAction(() => { throw new Error('无法读取所选存档文件，当前游戏未更改。'); }); }
      }} />
    </Modal>
    <MotionPresence>{confirmation && <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.action; setConfirmation(null); onAction(action); }} />}</MotionPresence>
  </>;
}
