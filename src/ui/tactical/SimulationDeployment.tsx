import { DWELL_SHOW_MS } from '../../studio/useDwellHover';
import { RefitHint } from '../../studio/RefitHint';
import { RefitInspection } from '../../studio/RefitInspection';
import { RefitHoverTerm } from '../../studio/RefitHoverTerms';
import { useInspectionCodex } from '../../studio/useInspectionCodex';
import { matchesRefitSearch, hullMatchesCategory, hullSearchAliases } from '../../studio/RefitSearch';
import { BATTLE_SIZE_PRESETS, BATTLE_SIZE_STEP, MIN_BATTLE_SIZE, MAX_BATTLE_SIZE } from '../../shared/battle-size.mjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { Modal } from '../core/UI';
import { NativeButton } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import { simulationRoster, groupSimulationHulls, prepareSimulationOption, simulationOptionErrors, registerSimulationOption, type SimulationOption } from './SimulationRoster';
import { SimulationLoadoutPicker, type LoadoutAnchor } from './SimulationLoadoutPicker';
import './simulation-deployment.css';

type Side='ally'|'enemy';
const PAGE_SIZE=80;
export function SimulationDeployment({ engine, onClose, onDeployed }: {
  engine: CombatEngine; onClose: () => void; onDeployed: () => void;
}) {
  const codex = useInspectionCodex();
  const codexOpen = useRef(codex.isOpen);
  const inspectionLocked = useRef(false);
  const roster = useMemo(() => simulationRoster(), []);
  const [side,setSide]=useState<Side>('enemy');
  const [selected,setSelected]=useState<Record<Side,string[]>>({ally:[],enemy:[]});
  const [hover,setHover]=useState<SimulationOption|null>(null);
  const [picker,setPicker]=useState<LoadoutAnchor|null>(null);
  // A clicked/keyboard-opened hull owns the popup until an explicit dismissal.
  const pinnedPicker=useRef(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const switchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelSwitch=useCallback(()=>{if(switchTimer.current!==null){clearTimeout(switchTimer.current);switchTimer.current=null;}},[]);
  const cancelClose=useCallback(()=>{if(closeTimer.current!==null){clearTimeout(closeTimer.current);closeTimer.current=null;}},[]);
  const closePicker=useCallback(()=>{cancelSwitch();cancelClose();pinnedPicker.current=false;inspectionLocked.current=false;setPicker(null);setHover(null);},[cancelClose,cancelSwitch]);
  const leavePicker=useCallback(()=>{
    cancelClose();if(pinnedPicker.current||inspectionLocked.current||codexOpen.current)return;
    closeTimer.current=setTimeout(()=>{if(!pinnedPicker.current&&!inspectionLocked.current&&!codexOpen.current){setPicker(null);setHover(null);}},350);
  },[cancelClose]);
  const inspectionLockChanged=useCallback((locked:boolean)=>{
    inspectionLocked.current=locked;cancelClose();
    // The portal is outside the selector: a locked reader, not an accidental click-pin, keeps it alive.
    if(!locked&&!document.activeElement?.closest('.sim-loadout-picker')&&!document.querySelector('.sim-loadout-picker:hover, .sim-deployment-ship[aria-expanded="true"]:hover'))leavePicker();
  },[cancelClose,leavePicker]);
  useLayoutEffect(()=>{
    const closing=codexOpen.current&&!codex.isOpen;codexOpen.current=codex.isOpen;
    if(codex.isOpen)cancelClose();
    else if(closing)inspectionLockChanged(false); // Resume hover expiry even if no new mouseleave fires after the modal.
  },[codex.isOpen,cancelClose,inspectionLockChanged]);
  useEffect(()=>()=>{if(closeTimer.current!==null)clearTimeout(closeTimer.current);if(switchTimer.current!==null)clearTimeout(switchTimer.current);},[]);
  useEffect(()=>{
    if(!picker)return;
    const outside=(event:PointerEvent)=>{if(codexOpen.current)return;if(event.target instanceof Element&&!event.target.closest('.sim-loadout-picker, .sim-deployment-ship')&&!(inspectionLocked.current&&event.target.closest('[data-dwell-id]'))){closePicker();}};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[picker,closePicker]);
  const [query,setQuery]=useState(''),[size,setSize]=useState(''),[scope,setScope]=useState('all');
  const [page,setPage]=useState(0),[error,setError]=useState('');
  const [,refresh]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),200);return()=>window.clearInterval(timer);},[]);
  const options=useMemo(()=>roster.filter(option=>hullMatchesCategory(option.spec,size)&&(scope!=='preset'||option.preset)
    &&matchesRefitSearch(query,option.name,option.variantName,option.hullId,option.id,hullSearchAliases(option.spec))),[roster,size,scope,query]);
  const hulls=useMemo(()=>groupSimulationHulls(options),[options]);
  const pages=Math.max(1,Math.ceil(hulls.length/PAGE_SIZE)),shownPage=Math.min(page,pages-1);
  const picks={ally:roster.filter(option=>selected.ally.includes(option.id)),enemy:roster.filter(option=>selected.enemy.includes(option.id))};
  const costs={ally:picks.ally.reduce((sum,o)=>sum+o.cost,0),enemy:picks.enemy.reduce((sum,o)=>sum+o.cost,0)};
  const used={ally:engine.simulationDeployedPoints(true),enemy:engine.simulationDeployedPoints(false)},limit=engine.simulationPointLimit;
  const over={ally:used.ally+costs.ally>limit,enemy:used.enemy+costs.enemy>limit};
  const total=picks.ally.length+picks.enemy.length;
  const changeSide=(next:Side)=>{setSide(next);closePicker();setError('');};
  const inspect=(option:SimulationOption)=>setHover(prepareSimulationOption(option));
  const toggle=(option:SimulationOption)=>{
    const resolved=prepareSimulationOption(option);setHover(resolved);
    if(resolved.errors.length){setError(resolved.errors.join('；'));return;}
    setSelected(current=>({...current,[side]:current[side].includes(option.id)?current[side].filter(id=>id!==option.id):[...current[side],option.id]}));setError('');
  };
  const deploy=()=>{
    if(!total||over.ally||over.enemy)return;
    try {
      // Both tab selections are one transaction. Filtering/switching tabs never discards the other side.
      const entries=([ 'ally','enemy' ] as const).flatMap(team=>picks[team].map(option=>({specId:registerSimulationOption(option),cost:option.cost,isPlayer:team==='ally'})));
      engine.deploySimulationFleet(entries);
      onDeployed();
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  };
  const changePointLimit=(value:number)=>{
    if(engine.setSimulationPointLimit(value)){refresh(n=>n+1);setError('');}
    else setError('不能低于场上舰船已经占用的部署点。');
  };
  const filtered=()=>{setPage(0);closePicker();};
  const summary=total?'友军 '+picks.ally.length+' 艘 +'+costs.ally+' DP · 敌军 '+picks.enemy.length+' 艘 +'+costs.enemy+' DP':'可切换友军/敌军分别选择，最后一次部署全部选择。';
  return <><Modal title="模拟战斗舰船部署" className="simulation-deployment" onClose={()=>{if(picker){const button=picker.element;closePicker();button.focus();closePicker();}else onClose();}} initialFocus="panel" surface="glass"
    onShortcut={key=>{if(key==='q')changeSide('ally');else if(key==='w')changeSide('enemy');}}
    footer={<><RefitHint text={engine.battleResult?'战斗已经结束，不能继续部署。':!total?'先点击配装行选择舰船；悬停只查看，不会自动选择。':over.ally||over.enemy?'所选舰船超出部署上限。减少对应阵营的选择或提高上限后，才能一次部署双方。':'确认后将友军和敌军的已选方案一起部署。悬停不会入场。'}><NativeButton disabled={!total||over.ally||over.enemy||!!engine.battleResult} onClick={deploy}>{picks.ally.length&&picks.enemy.length?'部署双方':picks.ally.length?'部署友军':'部署敌军'}</NativeButton></RefitHint>
      <NativeButton disabled={!total} onClick={()=>{setSelected({ally:[],enemy:[]});setError('');}}>清空选择</NativeButton><NativeButton onClick={onClose}>取消</NativeButton></>}>
    <div className="sim-deployment-tabs" role="tablist" aria-label="部署阵营">
      <NativeButton role="tab" aria-selected={side==='ally'} shortcut="Q" onClick={()=>changeSide('ally')}>友军{selected.ally.length?' ('+selected.ally.length+')':''}</NativeButton>
      <NativeButton role="tab" aria-selected={side==='enemy'} shortcut="W" onClick={()=>changeSide('enemy')}>敌军{selected.enemy.length?' ('+selected.enemy.length+')':''}</NativeButton>
    </div>
    <div className="sim-deployment-intro">
      <h2 data-side={side}><NativeBitmapText font="action" color="currentColor">{side==='enemy'?'选择敌方参战舰船':'选择友方参战舰船'}</NativeBitmapText></h2>
      {hover?<div className="sim-deployment-detail"><strong>{hover.name} · {hover.variantName}</strong><RefitHint text="部署点（DP）是此舰船入场占用的额度，不是装配点（OP）；友敌分别核算，模块随母舰入场，不重复添加。"><span>{hover.cost?hover.cost+' DP':'缺少独立部署费用'} · {hover.spec.designation??''}</span></RefitHint>
          {hover.errors.length?<small>不可部署：{hover.errors.join('；')}</small>:hover.warnings.length?<RefitInspection title="装配适配说明" content={<ul>{hover.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}><button type="button" className="sim-inspection-note">装配适配说明（{hover.warnings.length}）</button></RefitInspection>:<small>使用已导入的原版装配方案</small>}</div>
        :<p className="sim-deployment-hint">悬停预览配装，点击舰体固定窗口后选择。友敌选择分别保留，确认后一起入场。</p>}
    </div>
    <div className="sim-deployment-filters"><input aria-label="筛选模拟舰船" value={query} onChange={e=>{setQuery(e.target.value);filtered();}} placeholder="舰名 / 舰体ID / 装配"/>
      <select aria-label="筛选舰级" value={size} onChange={e=>{setSize(e.target.value);if(e.target.value==='STATION'||e.target.value==='MODULAR'){setScope('all');setQuery('');}filtered();}}><option value="">全部舰级</option><option value="STATION">空间站</option><option value="MODULAR">模块化舰体</option><option value="CAPITAL_SHIP">主力舰</option><option value="CRUISER">巡洋舰</option><option value="DESTROYER">驱逐舰</option><option value="FRIGATE">护卫舰</option></select>
      <select aria-label="舰船目录" value={scope} onChange={e=>{setScope(e.target.value);filtered();}}><option value="all">完整舰船目录</option><option value="preset">原版模拟预设</option></select></div>
    <div onScroll={()=>{if(!pinnedPicker.current&&!inspectionLocked.current)closePicker();}} className="sim-deployment-roster" aria-label={side==='enemy'?'敌军舰船名单':'友军舰船名单'}>
      {hulls.slice(shownPage*PAGE_SIZE,(shownPage+1)*PAGE_SIZE).map(hull=>{
        const option=hull.options[0],count=hull.options.filter(fit=>selected[side].includes(fit.id)).length;
        const open=(element:HTMLButtonElement,pin=false)=>{
          if((pinnedPicker.current||codexOpen.current)&&!pin)return; // Only an explicit click/keyboard pin remains persistent.
          cancelSwitch();
          if(inspectionLocked.current&&!pin){
            // Do not replace the source while crossing the small gap into a reader.
            // Staying on another hull opens it after the abandoned reader's exit grace.
            switchTimer.current=setTimeout(()=>{switchTimer.current=null;if(element.isConnected&&element.matches(':hover')&&!inspectionLocked.current)open(element);},DWELL_SHOW_MS);
            return;
          }
          cancelClose();pinnedPicker.current=pin;
          setPicker(current=>current?.element===element&&current.pinned===pin?current:{hull,element,pinned:pin});inspect(option);
        };
        return <button type="button" className="sim-deployment-ship" key={hull.hullId}
          aria-label={option.name+' · '+hull.options.length+' 项配装'+(count?' · 已选 '+count:'')} aria-expanded={picker?.hull.hullId===hull.hullId}
          aria-controls={picker?.hull.hullId===hull.hullId?'sim-loadout-picker':undefined}
          aria-pressed={count>0} aria-disabled={hull.options.every(fit=>simulationOptionErrors(fit).length>0)}
          onMouseEnter={event=>open(event.currentTarget)} onMouseLeave={leavePicker}
          onFocus={event=>open(event.currentTarget,event.currentTarget.matches(':focus-visible'))} onBlur={event=>{if(!(event.relatedTarget instanceof Element)||!event.relatedTarget.closest('.sim-loadout-picker'))leavePicker();}}
          onClick={event=>open(event.currentTarget,true)} onKeyDownCapture={event=>{if(event.key==='ArrowDown'){event.preventDefault();const element=event.currentTarget;open(element,true);requestAnimationFrame(()=>{if(document.activeElement===element)document.querySelector<HTMLButtonElement>('.sim-loadout-option')?.focus();});}}}>
          <img src={runtimeAssetUrl(option.spec.spriteUrl)} alt="" draggable={false} style={{width:option.spec.spriteWidth*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px',height:option.spec.spriteHeight*Math.min(.2,52/option.spec.spriteWidth,56/option.spec.spriteHeight)+'px'}}/>
          <b><NativeBitmapText font="caption" color="currentColor">{option.cost?String(option.cost):'—'}</NativeBitmapText></b>
          <span className="sim-hull-fits">{count?'✓ '+count:hull.options.length+' 配装'}</span>
        </button>;
      })}{!hulls.length&&<p className="sim-empty">没有符合筛选条件的舰船。</p>}
    </div>
    {picker&&<SimulationLoadoutPicker anchor={picker} selected={selected[side]} onToggle={toggle} onInspect={inspect}
      onEnter={cancelClose} onLeave={leavePicker} onClose={()=>{picker.element.focus();closePicker();}}
      onLockChange={inspectionLockChanged} onOpenCodex={codex.open} inspectionEnabled={!codex.isOpen}/>}
    <div className="sim-deployment-pages"><span>{hulls.length} 种舰体 · {options.length} 项装配</span>
      <button type="button" aria-label="上一页舰船" disabled={shownPage===0} onClick={()=>{setPage(shownPage-1);closePicker();}}>上一页</button><span>{shownPage+1} / {pages}</span><button type="button" aria-label="下一页舰船" disabled={shownPage===pages-1} onClick={()=>{setPage(shownPage+1);closePicker();}}>下一页</button></div>
    <div className="sim-deployment-limit">
      <RefitHint text="友军与敌军分别使用这份部署额度，不是双方共享；友军已部署值包含旗舰。只影响本次模拟，不能调到低于已部署占用的数值。"><label htmlFor="sim-point-limit"><NativeBitmapText font="caption" color="currentColor">每方部署上限</NativeBitmapText></label></RefitHint>
      <input aria-label="调整每方部署上限" type="range" min={MIN_BATTLE_SIZE/2} max={Math.max(MAX_BATTLE_SIZE/2,limit)} step={BATTLE_SIZE_STEP/2}
        value={limit} disabled={!!engine.battleResult} onChange={event=>changePointLimit(Number(event.target.value))}/>
      <select id="sim-point-limit" aria-label="每方部署上限" value={limit} disabled={!!engine.battleResult} onChange={event=>changePointLimit(Number(event.target.value))}>
        {[...new Set([...BATTLE_SIZE_PRESETS.map(value=>value/2),limit])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value} DP</option>)}
      </select>
    </div>
    <div className="sim-deployment-budgets">{(['ally','enemy'] as const).map(team=><RefitInspection key={team} title={(team==='ally'?'友军':'敌军')+'部署额度'} content={<>
      <p><RefitHoverTerm term="deploymentPoints">部署点（DP）</RefitHoverTerm>独立按阵营核算{team==='ally'?'，已部署包含旗舰':''}。</p>
      <p>已部署 {used[team]} + 待部署 {costs[team]} = {used[team]+costs[team]} / {limit} DP</p>
      <p className={over[team]?'refit-inspection-warnings':undefined}>{over[team]?'超出 '+(used[team]+costs[team]-limit)+' DP；需减少选择或提高上限。':'确认后剩余 '+(limit-used[team]-costs[team])+' DP。'}</p>
      {picks[team].length>0&&<ul>{picks[team].map(option=><li key={option.id}>{option.name} · {option.variantName}：{option.cost} DP</li>)}</ul>}
      <p className="refit-inspection-note">这是待确认的选择；悬停不部署。任一方超限时，双方都不会入场。</p>
    </>}><div className="sim-deployment-meter" data-over={over[team]} role="status" aria-label={team==='ally'?'友军部署点数':'敌军部署点数'}>
      <i style={{width:Math.min(100,(used[team]+costs[team])/limit*100)+'%'}}/><span>{team==='ally'?'友军':'敌军'} {used[team]} + {costs[team]} / {limit}</span></div></RefitInspection>)}</div>
    <div className="sim-deployment-feedback" role="status">{error||(over.ally||over.enemy?([over.ally?'友军':'',over.enemy?'敌军':''].filter(Boolean).join('、')+'超出部署上限，双方均未部署。'):summary)}</div>
  </Modal>{codex.content}</>;
}
