import {NativeCampaignMessages} from './NativeCampaignMessages';
import {NativeLogisticsHud} from './NativeLogisticsHud';
import {NativeColonyManagement,type NativeColonyAction,type NativeColonyBuildOptions} from './NativeColonyManagement';
import type {NativeColonyManagementView} from '../../../server/campaign/native/ColonyManagement.mjs';
import {useCallback,useEffect,useRef,useState} from 'react';
import {NativeButton,NativeFrame} from '../../ui/NativeChrome';
import {NativeSceneCanvas,type NativeSceneSelection} from './NativeSceneCanvas';
import {NativeLootPanel} from './NativeLootPanel';
import {NativeAbilityBar} from './NativeAbilityBar';
import {playNativeAbilityReceiptSounds} from './NativeAbilityAudio';
import type {NativeAbilityBar as AbilityBar,OriginalAbilityBarGesture} from '../rules/OriginalCampaignAbilityBar.mjs';
import {CampaignApiError,errorText,readNativeDevelopmentSession,sendNativeLootCargoCommand,sendNativeNavigationCommand,sendNativeAbilityCommand,sendNativeColonyCommand} from './CampaignClient';
import type {NativeDevelopmentSession,NativeLootCargoCommand,NativeNavigationCommand,NativeAbilityCommand,NativeColonyCommand} from './NativeProtocol';
import type {NativeLootCargoView,OriginalLootCargoAction} from '../rules/OriginalLootCargoTransaction.mjs';
type NativePlayerCommand=NativeColonyCommand|NativeLootCargoCommand|NativeAbilityCommand|Extract<NativeNavigationCommand,{type:'native.fleet.navigate'}>;
function isPendingAbility(c:NativePlayerCommand):boolean{
 const p=c.payload,exact=(v:object,keys:string[])=>v!==null&&typeof v==='object'&&Object.keys(v).every(k=>keys.includes(k));
 if(c.type==='native.ability.press'){const p=c.payload;return exact(p,['dataRef','slotIndex','abilityId'])&&Number.isInteger(p.slotIndex)&&p.slotIndex>=0&&p.slotIndex<10&&typeof p.abilityId==='string'&&p.abilityId.length>0&&p.abilityId.length<=128;}
 if(c.type!=='native.ability-bar.change'||!exact(p,['dataRef','action']))return false;
 const a=c.payload.action;return !!a&&(a.kind==='page'&&exact(a,['kind','direction'])&&(a.direction===1||a.direction===-1)||a.kind==='lock'&&exact(a,['kind','locked'])&&typeof a.locked==='boolean');
}
function isPendingColony(c:NativePlayerCommand):boolean{
 if(c.type!=='native.colony.construction')return false;
 const p=c.payload,a=p.action,keys={ 'inspect-build':['kind','marketId'],build:['kind','marketId','industryId','expectedCost'],'cancel-construction':['kind','marketId','industryId'],'swap-construction':['kind','marketId','industryId','otherIndustryId']};
 if(!a||!Object.hasOwn(keys,a.kind)||typeof p.marketId!=='string'||a.marketId!==p.marketId)return false;
 if(Object.keys(p).length!==3||Object.keys(p).some(k=>!['dataRef','marketId','action'].includes(k))||Object.keys(a).length!==keys[a.kind].length||Object.keys(a).some(k=>!keys[a.kind].includes(k)))return false;
 return (a.kind==='inspect-build'||typeof a.industryId==='string')&&(a.kind!=='build'||Number.isInteger(a.expectedCost))&&(a.kind!=='swap-construction'||typeof a.otherIndustryId==='string');
}
const pendingKey=(world:string,player:string)=>'campaign-native-pending:'+JSON.stringify([world,player]);
function loadPending(initial:NativeDevelopmentSession):{command:NativePlayerCommand|null;error:string}{
 try{
  const raw=sessionStorage.getItem(pendingKey(initial.view.worldId,initial.view.playerId));if(raw===null)return {command:null,error:''};const c=JSON.parse(raw);
  if(c?.worldId!==initial.view.worldId||typeof c.requestId!=='string'||!c.requestId||typeof c.epoch!=='string'||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||typeof c.payload?.dataRef!=='string'||!(c.type==='native.loot.actions'&&typeof c.payload?.encounterId==='string'&&Array.isArray(c.payload.actions)&&c.payload.actions.length>0&&c.payload.actions.length<=128||c.type==='native.fleet.navigate'&&Number.isFinite(c.payload.x)&&Number.isFinite(c.payload.y)||isPendingAbility(c)||isPendingColony(c)))throw Error('invalid pending command');
  return {command:c,error:''};
 }catch{return {command:null,error:'待确认指令无法读取；为避免重复执行，已禁用操作，请由房主核对回执。'};}
}
/** Native session is a distinct transport, never projected into the reference world's invented fleets. */
export function NativeCampaignApp({token,initial,onDisconnect}:{token:string;initial:NativeDevelopmentSession;onDisconnect:()=>void}){
 const [session,setSession]=useState(initial),sessionRef=useRef(initial);
 const [recovery]=useState(()=>loadPending(initial));
 const [pending,setPending]=useState(recovery.command),pendingRef=useRef(recovery.command);
 const [busy,setBusy]=useState(false),busyRef=useRef(false),[message,setMessage]=useState(recovery.command?'发现未确认操作，请重试同一请求。':''),[network,setNetwork]=useState('');
 const [managementOpen,setManagementOpen]=useState(false),[buildQuote,setBuildQuote]=useState<(NativeColonyBuildOptions&{revision:number;epoch:string})|null>(null);
 const [selected,setSelected]=useState(initial.view.lootWindows[0]?.encounterId??'');
 const [frameMessageIssue,setFrameMessageIssue]=useState('');
 const alive=useRef(true),readSerial=useRef(0),appliedSerial=useRef(0),heardReceipts=useRef(new Set<string>());
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 const apply=useCallback((next:NativeDevelopmentSession,serial:number)=>{
  if(!alive.current||serial<appliedSerial.current)return;
  if(next.view.worldId!==initial.view.worldId||next.view.playerId!==initial.view.playerId)throw new CampaignApiError('WRONG_WORLD',false);
  const old=sessionRef.current;if(old.epoch===next.epoch&&old.view.revision>next.view.revision)return;
  appliedSerial.current=serial;sessionRef.current=next;setSession(next);
 },[initial.view.worldId,initial.view.playerId]);
 const refresh=useCallback(async()=>{const serial=++readSerial.current;const next=await readNativeDevelopmentSession(token);apply(next,serial);if(alive.current)setNetwork('');},[token,apply]);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{if(!busyRef.current)await refresh();}catch(e){if(active)setNetwork(errorText(e));}finally{if(active)timer=setTimeout(poll,1000);}};
  void poll();return ()=>{active=false;clearTimeout(timer);};
 },[refresh]);
 const remember=(command:NativePlayerCommand)=>{sessionStorage.setItem(pendingKey(command.worldId,initial.view.playerId),JSON.stringify(command));pendingRef.current=command;setPending(command);};
 const forget=(worldId:string)=>{sessionStorage.removeItem(pendingKey(worldId,initial.view.playerId));pendingRef.current=null;if(alive.current)setPending(null);};
 const execute=async(command?:NativePlayerCommand)=>{
  if(busyRef.current||recovery.error||command&&pendingRef.current)return false;
  const outgoing=command??pendingRef.current;if(!outgoing)return false;busyRef.current=true;setBusy(true);setMessage('');
  try{
   // Persist before sending. Unknown responses keep the exact id, epoch, version and gestures.
   if(command)remember(command);
   const receipt=outgoing.type==='native.loot.actions'?await sendNativeLootCargoCommand(token,outgoing):outgoing.type==='native.fleet.navigate'?await sendNativeNavigationCommand(token,outgoing):outgoing.type==='native.colony.construction'?await sendNativeColonyCommand(token,outgoing):await sendNativeAbilityCommand(token,outgoing);
   if(receipt.worldId!==outgoing.worldId||receipt.requestId!==outgoing.requestId||!Number.isSafeInteger(receipt.revision))throw new CampaignApiError('INVALID_RESPONSE',true);
   const current=sessionRef.current,cargo=receipt.result.cargo as unknown as NativeLootCargoView;
   if(outgoing.type==='native.loot.actions'&&alive.current&&current.epoch===outgoing.epoch&&receipt.revision>=current.view.revision&&cargo?.scope==='native-loot-cargo-all-tab'){
    const next={...current,view:{...current.view,revision:receipt.revision,lootWindows:current.view.lootWindows.map(window=>window.encounterId===outgoing.payload.encounterId&&window.dataRef===outgoing.payload.dataRef?{...window,cargo}:window)}};
    sessionRef.current=next;setSession(next);
   }
   if(outgoing.type==='native.ability.press'||outgoing.type==='native.ability-bar.change'){
    const abilityBar=receipt.result.abilityBar as unknown as AbilityBar;
    if(alive.current&&current.epoch===outgoing.epoch&&receipt.revision>=current.view.revision&&receipt.result.dataRef===outgoing.payload.dataRef&&abilityBar?.scope==='native-campaign-ability-bar'){
     const next={...current,view:{...current.view,revision:receipt.revision,fleets:current.view.fleets.map(f=>f.dataRef===outgoing.payload.dataRef?{...f,abilityBar}:f)}};sessionRef.current=next;setSession(next);
    }
    const soundKey=JSON.stringify([outgoing.worldId,outgoing.requestId]);if(alive.current&&!heardReceipts.current.has(soundKey)){heardReceipts.current.add(soundKey);playNativeAbilityReceiptSounds(receipt.result.effects);}
   }
   if(outgoing.type==='native.colony.construction'&&alive.current&&current.epoch===outgoing.epoch&&receipt.revision>=current.view.revision){
     const view=receipt.result.colonyManagement as unknown as NativeColonyManagementView;
     if(view?.scope!=='native-colony-management'||receipt.result.marketId!==outgoing.payload.marketId)throw new CampaignApiError('INVALID_RESPONSE',true);
     const next={...current,view:{...current.view,revision:receipt.revision,colonyManagement:view}};sessionRef.current=next;setSession(next);
     const construction=receipt.result.construction as unknown as {kind:string;marketId:string;inspection?:NativeColonyBuildOptions['inspection']};
     if(construction?.kind==='inspect-build'&&construction.inspection&&construction.marketId===outgoing.payload.marketId)setBuildQuote({marketId:construction.marketId,inspection:construction.inspection,revision:receipt.revision,epoch:outgoing.epoch});else setBuildQuote(null);
    }
    forget(outgoing.worldId);
    if(alive.current)setMessage(outgoing.type==='native.colony.construction'?'殖民地操作已确认。':outgoing.type==='native.loot.actions'?'货物操作已确认。':outgoing.type==='native.fleet.navigate'?'导航指令已确认；世界推进仍在接入。':'能力操作已确认。');
   try{await refresh();}catch(e){if(alive.current)setNetwork(errorText(e));}return true;
  }catch(e){
   if(e instanceof CampaignApiError&&!e.uncertain){forget(outgoing.worldId);try{await refresh();}catch(refreshError){if(alive.current)setNetwork(errorText(refreshError));}}
   if(alive.current)setMessage(errorText(e)+(pendingRef.current?' 请重试同一请求，不会自动重发新操作。':''));return false;
  }finally{busyRef.current=false;if(alive.current)setBusy(false);}
 };
 const window=session.view.lootWindows.find(w=>w.encounterId===selected)??session.view.lootWindows[0];
 const locked=busy||pending!==null||!!recovery.error||!!network;
 const act=(actions:OriginalLootCargoAction[])=>{
  if(locked||!window)return Promise.resolve(false);
  // Slot indices refer to precisely the displayed revision. Never rebase onto a new inventory.
  return execute({worldId:session.view.worldId,epoch:session.epoch,requestId:crypto.randomUUID(),expectedRevision:session.view.revision,type:'native.loot.actions',payload:{dataRef:window.dataRef,encounterId:window.encounterId,actions}});
 };
 const observer=session.view.fleets.find(f=>f.dataRef===window?.dataRef)??session.view.fleets[0];
 const abilityCommand=(gesture:{slotIndex:number;abilityId:string}|OriginalAbilityBarGesture)=>{
  if(locked||window||managementOpen||!observer||observer.expired||!observer.abilityBar)return;
  const base={worldId:session.view.worldId,epoch:session.epoch,requestId:crypto.randomUUID(),expectedRevision:session.view.revision};
  void execute('slotIndex' in gesture?{...base,type:'native.ability.press',payload:{dataRef:observer.dataRef,...gesture}}:{...base,type:'native.ability-bar.change',payload:{dataRef:observer.dataRef,action:gesture}});
 };
 const navigate=(point:NativeSceneSelection)=>{if(locked||window||managementOpen||!observer||observer.expired)return;void execute({worldId:session.view.worldId,epoch:session.epoch,requestId:crypto.randomUUID(),expectedRevision:point.revision,type:'native.fleet.navigate',payload:{dataRef:observer.dataRef,x:point.x,y:point.y}});};
 const colonyAction=(action:NativeColonyAction)=>{
   if(locked||window)return Promise.resolve(false);
   const owner=session.view.colonyControls?.find(c=>c.marketId===action.marketId);if(!owner)return Promise.resolve(false);
   if(action.kind==='build'&&(!buildQuote||buildQuote.epoch!==session.epoch||buildQuote.revision!==session.view.revision||buildQuote.marketId!==action.marketId))return Promise.resolve(false);
   return execute({worldId:session.view.worldId,epoch:session.epoch,requestId:crypto.randomUUID(),expectedRevision:session.view.revision,type:'native.colony.construction',payload:{dataRef:owner.dataRef,marketId:action.marketId,action}});
  };
  useEffect(()=>{
   const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.repeat||e.ctrlKey||e.altKey||e.metaKey||window)return;const t=e.target as HTMLElement;if(t?.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.code==='KeyD'){e.preventDefault();setManagementOpen(v=>!v);}else if(e.code==='Escape'&&managementOpen){e.preventDefault();setManagementOpen(false);}
   };globalThis.addEventListener('keydown',key);return ()=>globalThis.removeEventListener('keydown',key);
  },[window,managementOpen]);
  return <main className="campaign-shell native-campaign-shell" data-runtime="native-development" data-core-panel={window?'native-loot':managementOpen?'native-colonies':undefined}>
  {observer&&!observer.expired&&observer.locationRef&&<NativeSceneCanvas token={token} worldId={session.view.worldId} epoch={session.epoch} observerDataRef={observer.dataRef} revision={session.view.revision} locked={locked||!!window||managementOpen} onSelect={navigate}/>}
  {window?<NativeFrame className="native-campaign-loot-frame" surface="glass"><NativeLootPanel key={window.encounterId} cargo={window.cargo} locked={locked} onActions={act}/></NativeFrame>:!observer||observer.expired||!observer.locationRef?<section className="native-campaign-empty"><h1>原生生涯世界</h1><p>当前没有位于真实场景内的可控舰队。</p></section>:null}
  {managementOpen&&!window&&<NativeColonyManagement view={session.view.colonyManagement} locked={locked} pending={busy||pending!==null} buildOptions={buildQuote} quoteRevision={buildQuote?.epoch===session.epoch?buildQuote.revision:null} revision={session.view.revision} onAction={colonyAction} onClose={()=>setManagementOpen(false)} notice={recovery.error||network||message}/>}
   <NativeCampaignMessages key={initial.view.worldId+':'+initial.view.playerId} token={token} worldId={session.view.worldId} playerId={session.view.playerId} epoch={session.epoch} initialRevision={initial.view.revision} ownedDataRefs={session.view.fleets.map(f=>f.dataRef)} onIssue={setFrameMessageIssue}/>
   {observer&&<NativeLogisticsHud view={observer.logisticsHud} expanded={!!window} revision={session.view.revision} dataRef={observer.dataRef}/>}
   <div className="native-campaign-status" aria-label="连接与开发状态">
   <p>原生生涯开发中 · 世界推进尚未接入 · revision {session.view.revision}<NativeButton disabled={busy} onClick={onDisconnect}>断开连接</NativeButton></p>
   {session.view.lootWindows.length>1&&session.view.lootWindows.map(w=><NativeButton key={w.encounterId} disabled={locked} onClick={()=>setSelected(w.encounterId)}>{session.view.fleets.find(f=>f.dataRef===w.dataRef)?.name??w.dataRef}</NativeButton>)}
   <p role="status">{recovery.error||network||frameMessageIssue||message}</p>
   {pending&&<NativeButton disabled={busy} onClick={()=>void execute()}>重试同一请求</NativeButton>}
   {busy&&<span> 等待服务器回执…</span>}
  </div>
  {!window&&!managementOpen&&observer&&!observer.expired&&observer.locationRef&&observer.abilityBar&&<NativeAbilityBar key={observer.dataRef+':'+observer.abilityBar.page} bar={observer.abilityBar} locked={locked} onPress={(slotIndex,abilityId)=>abilityCommand({slotIndex,abilityId})} onChange={abilityCommand}/>}
  <nav className="native-campaign-nav" aria-label="核心功能">{[['角色技能','C'],['舰队管理','F'],['舰队改装','R'],['乘员 & 货物','I'],['星图','Tab'],['情报信息','E'],['综合管理','D']].map(([label,key])=><NativeButton key={key} shortcut={key} disabled={!!window||key!=='D'} onClick={()=>setManagementOpen(v=>!v)} aria-pressed={key==='D'?managementOpen:undefined} title={key==='D'?'综合管理：本人授权的殖民地':'此原生页面尚未接完整导航'}>{label}</NativeButton>)}</nav>
 </main>;
}
