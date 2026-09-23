import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import {useEffect,useLayoutEffect,useRef,useState,type MouseEvent} from 'react';
import {NativeBitmapText} from '../../ui/NativeBitmapText';
import type {NativeLootCargoView,NativeLootItemView,OriginalLootCargoAction,OriginalLootCargoSide} from '../rules/OriginalLootCargoTransaction.mjs';
import './CargoPanel.css';
import './NativeLootPanel.css';
const amount=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
const closingUnavailable='战后结算和关闭回调尚未接入此服务器；不会仅隐藏窗口冒充结算。';
function ItemIcon({item}:{item:NativeLootItemView}){
 const [failed,setFailed]=useState(false);
 if(failed||!item.display.icons.length)return <span className="cargo-panel-missing-icon">{item.display.name}<small>图像未就绪</small></span>;
 return <span className={'native-loot-icon native-loot-icon-'+item.type} aria-hidden="true">{item.display.icons.map((icon,i)=><img key={i} src={runtimeAssetUrl('/game-assets/'+icon)} alt="" draggable={false} onError={()=>setFailed(true)}/>)}{item.display.overlay&&<img className="native-loot-icon-overlay" src={runtimeAssetUrl('/game-assets/'+item.display.overlay)} alt="" draggable={false} onError={()=>setFailed(true)}/>}</span>;
}
export function NativeLootPanel({cargo,locked,onActions}:{cargo:NativeLootCargoView;locked:boolean;onActions:(actions:OriginalLootCargoAction[])=>Promise<boolean>}){
 const root=useRef<HTMLElement>(null),inventory=useRef<HTMLDivElement>(null),ghost=useRef<HTMLDivElement>(null),pointer=useRef({x:window.innerWidth/2,y:window.innerHeight/2});
 const [columns,setColumns]=useState(10),[note,setNote]=useState('');
 useEffect(()=>{root.current?.focus();const element=inventory.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setColumns(Math.max(1,Math.min(10,Math.floor((entry.contentRect.width-4)/100)))));observer.observe(element);return ()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{if(ghost.current){ghost.current.style.left=pointer.current.x+'px';ghost.current.style.top=pointer.current.y+'px';}},[cargo.picked]);
 const act=(actions:OriginalLootCargoAction[])=>{if(locked)return;setNote('');void onActions(actions);};
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   const key=event.key.toLowerCase();
   if(key==='escape'){event.preventDefault();if(locked)return;if(cargo.picked)act([{kind:'return'}]);else setNote(closingUnavailable);}
   else if(key==='t'){event.preventDefault();if(!cargo.picked&&cargo.transactionExists)act([{kind:'cancel'}]);}
   else if(key==='g'){event.preventDefault();if(!locked&&!cargo.picked)setNote(closingUnavailable);}
  };
  window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);
 });
 const click=(event:MouseEvent,side:OriginalLootCargoSide,index:number)=>{
  if(locked)return;
  if(event.shiftKey||event.ctrlKey||event.altKey||event.metaKey){setNote('原生数量选择与快捷转移尚未接线；此次没有拿取整组。');return;}
  pointer.current={x:event.clientX,y:event.clientY};act([{kind:cargo.picked?'drop':'pick',side,index}]);
 };
 const grid=(side:OriginalLootCargoSide)=>{
  const slots=cargo[side].slots,count=Math.min(65536,Math.max(columns*4,Math.ceil((slots.length+1)/columns)*columns));
  const invalid=side==='loot'&&!!cargo.picked&&!cargo.picked.stack.display.canPutInLoot;
  return <div className="cargo-panel-grid-scroll"><div className="cargo-panel-grid" role="list" aria-label={side==='loot'?'战利品货物':'持有货物'} style={{gridTemplateColumns:'repeat('+columns+',minmax(0,1fr))'}}>
   {Array.from({length:count},(_,index)=>{const item=slots[index];return <div className="cargo-panel-cell" role="listitem" key={index} data-slot-index={index} data-item-type={item?.type} data-item-id={item?.type==='RESOURCES'?item.commodityId:item?.itemId}>
    {(item||cargo.picked)&&<button type="button" className="cargo-panel-stack" disabled={locked||invalid} onClick={event=>click(event,side,index)}
      aria-label={item?(cargo.picked?'放到 ':'拿起 ')+item.display.name+' × '+amount.format(item.size):(side==='loot'?'放入战利品':'放回货舱')+' 空格 '+(index+1)}
      title={invalid?'船员、陆战队和任务物品不能放进战利品':item?item.display.name+' × '+amount.format(item.size):undefined}>
     {item&&<><ItemIcon key={item.type+('commodityId'in item?item.commodityId:item.itemId)+('itemData'in item?item.itemData:'')} item={item}/><span className="cargo-panel-amount">{amount.format(item.size)}</span></>}
    </button>}
   </div>;})}
  </div></div>;
 };
 const rows=[...cargo.bought.slots.filter((i):i is NativeLootItemView=>i!==null).map(item=>({item,verb:'收取'})),...cargo.sold.slots.filter((i):i is NativeLootItemView=>i!==null).map(item=>({item,verb:'存放'}))];
 return <section ref={root} tabIndex={-1} className="cargo-panel native-loot-panel" role="dialog" aria-modal="true" aria-label="打捞发现" aria-busy={locked} data-holding={!!cargo.picked}
   onPointerMove={event=>{pointer.current={x:event.clientX,y:event.clientY};if(ghost.current){ghost.current.style.left=event.clientX+'px';ghost.current.style.top=event.clientY+'px';}}}
   onContextMenu={event=>{event.preventDefault();if(cargo.picked)act([{kind:'return'}]);}}>
  <div className="cargo-panel-layout">
   <aside className="cargo-panel-quartermaster" aria-label="打捞作业与转移汇总">
    <img className="cargo-panel-flag" src={runtimeAssetUrl('/game-assets/graphics/illustrations/space_wreckage.jpg')} alt="残骸" draggable={false}/>
    <section className="cargo-panel-transfer-summary" aria-label="打捞作业"><h2><NativeBitmapText font="caption" color="currentColor">打捞作业</NativeBitmapText></h2><ul>{rows.map(({item,verb},i)=><li key={i}>{verb} {item.display.name} × {amount.format(item.size)}</li>)}</ul></section>
    <div className="cargo-panel-transaction-actions native-loot-actions">
     <button type="button" disabled={locked||!!cargo.picked||!cargo.transactionExists} onClick={()=>act([{kind:'cancel'}])} aria-label="撤销 [T]">撤销 <span className="cargo-panel-key">[T]</span></button>
     <button type="button" disabled={locked||!!cargo.picked||cargo.loot.slots.every(s=>s===null)} onClick={()=>act([{kind:'take-all'}])} title={cargo.tookAll?'再次收取将不再限制燃料容量':'首次收取的燃料不超过剩余容量，其它货物允许超载'}>全部收取</button>
     <button type="button" className="native-loot-continue" disabled title={closingUnavailable}>确认并继续 <span className="cargo-panel-key">[G]</span></button>
    </div>
    <p className="native-loot-limit">{closingUnavailable}</p>
   </aside>
   <div ref={inventory} className="native-loot-inventory">
    <section className="native-loot-container" aria-label="战利品"><header className="cargo-panel-toolbar"><span className="cargo-panel-discard-tab">打捞发现</span><button type="button" className="cargo-panel-sort" disabled={locked||!!cargo.picked} onClick={()=>act([{kind:'sort',side:'loot'}])} aria-label="排序战利品">排序</button></header>{grid('loot')}</section>
    <section className="native-loot-container" aria-label="玩家货舱"><header className="cargo-panel-toolbar"><div className="cargo-panel-tabs" role="tablist" aria-label="货物分类">{['全部','资源','舰载武器','其它'].map((name,index)=><button key={name} type="button" role="tab" className="cargo-panel-tab" aria-selected={index===0} disabled={index!==0||locked||!!cargo.picked} title={index?'分类副本尚未接入原生服务器；当前全部分类可操作':undefined}><NativeBitmapText font="caption" color="currentColor">{name}</NativeBitmapText><span className="cargo-panel-key">[{index+1}]</span></button>)}</div><button type="button" className="cargo-panel-sort" disabled={locked||!!cargo.picked} onClick={()=>act([{kind:'sort',side:'fleet'}])} aria-label="排序持有货物">排序</button></header>{grid('fleet')}</section>
   </div>
  </div>
  {cargo.picked&&<div ref={ghost} className="cargo-panel-held" data-testid="native-held-cargo" aria-label={'手持 '+cargo.picked.stack.display.name}><ItemIcon item={cargo.picked.stack}/><span className="cargo-panel-amount">{amount.format(cargo.picked.stack.size)}</span></div>}
  <p className="cargo-panel-interaction-note" role="status">{note||'左键拿起/放下整组；手持时 Esc 或右键放回；T 撤销。Shift、Ctrl、分类视图和完整结算仍在接线。'}</p>
 </section>;
}
