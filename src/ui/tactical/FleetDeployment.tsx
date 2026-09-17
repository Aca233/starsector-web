import { useEffect, useState } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import './fleet-deployment.css';
const labels={reserve:'待命',deployed:'已部署',retreating:'撤退中',retreated:'已撤离',destroyed:'已损失'};
export function FleetDeployment({engine,team,onClose,onDeployed,onDeploy}:{engine:CombatEngine;team:number;onClose:()=>void;onDeployed:()=>void;onDeploy?:(ids:string[])=>Promise<void>}){
  const [selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [,refresh]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),200);return()=>window.clearInterval(timer);},[]);
  const rows=engine.deployment.snapshot().rows.filter(row=>row.teamId===team);
  const reason=engine.deployment.reason(selected,team),used=engine.deployment.used(team);
  const cost=rows.filter(row=>selected.includes(row.id)).reduce((sum,row)=>sum+row.cost,0);
  const deploy=async()=>{if(reason||busy)return;setBusy(true);setError('');try{if(onDeploy)await onDeploy(selected);else engine.deployment.deploy(selected,team);onDeployed();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  return <Modal title="舰队增援" className="fleet-deployment" onClose={()=>{if(!busy)onClose();}} initialFocus="panel" surface="glass"
    footer={<><span role="status">已部署 {used} / {engine.deployment.limit} · 本次 +{cost}</span><NativeButton disabled={!!reason||busy} onClick={()=>void deploy()}>{busy?'等待部署确认…':'部署'}</NativeButton><NativeButton disabled={busy} onClick={onClose}>取消</NativeButton></>}>
    <p>从本队战前编成中呼叫增援。战斗继续运行；确认后从本方边缘入场，并关闭地图。</p>
    <div className="fleet-deployment-list" aria-label="本队舰船">
      {rows.map(row=>{const ship=engine.allCapitalShips.find(s=>s.id===row.id)!;return <button type="button" key={row.id} disabled={busy||row.status!=='reserve'} aria-pressed={selected.includes(row.id)} onClick={()=>setSelected(ids=>ids.includes(row.id)?ids.filter(id=>id!==row.id):[...ids,row.id])}>
        <img src={runtimeAssetUrl(ship.spec.spriteUrl)} alt=""/><span><strong>{i18n.t(ship.spec.nameKey)}</strong><small>结构 {Math.ceil(ship.hullHp/ship.maxHullHp*100)}% · CR {Math.round(ship.currentCR*100)}%</small></span><span>{row.cost} DP<small>{labels[row.status]}</small></span>
      </button>;})}
    </div>
    <p role="status">{error||(selected.length?reason:'请选择待命舰船；已撤离和已损失舰船不能在本场重新部署。')}</p>
  </Modal>;
}
