import { sameTeam } from "../../engine/simulation/CombatTeams";
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { CombatEngine } from '../../engine/simulation/CombatEngine';
import type { TacticalOrder } from '../../engine/simulation/CombatTypes';
import { Vector2 } from '../../engine/math/Vector2';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { TacticalCommandDock, type TacticalAction, type TacticalActionGroup } from './TacticalCommandDock';
import { TacticalShipStatus } from './TacticalShipStatus';
import { tacticalContactVisible, tacticalObservers } from './TacticalVisibility';
import { NativeBitmapText } from '../NativeBitmapText';
import { fitTacticalView, mapWorld, pickMapShip, TacticalMapPainter, zoomTacticalView } from './TacticalMapPainter';
import './tactical-map.css';

export interface TacticalMapProps {
  engine: CombatEngine;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  autopilot: boolean;
  onAutopilotChange: (enabled: boolean) => void;
  inputBlocked: boolean;
  onOpenDeployment?: () => void;
  /** LAN map is a view, not a local command authority. */
  readOnlyCommands?: boolean;
  onClosed?: () => void;
  onRetreat?: (ids:string[], full:boolean) => Promise<void>;
  cameraPosRef?: MutableRefObject<Vector2>;
  zoomRef?: MutableRefObject<number>;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}
const asset = (name: string) => runtimeAssetUrl('graphics/warroom/' + name + '.png');
const nameOf = (ship: CombatEngine['playerShip']) => i18n.t(ship.spec.nameKey);

export function TacticalMap(props: TacticalMapProps) {
  const { engine, paused, onPausedChange, autopilot, onAutopilotChange, inputBlocked } = props;
  const rootRef = useRef<HTMLElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => { live.current = props; });
  const view = useRef(fitTacticalView(engine));
  const hover = useRef<string | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; center: Vector2; moved: boolean } | null>(null);
  const sequence = useRef(0);
  const [message, setMessage] = useState('');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspectedRef = useRef<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => { inspectedRef.current = inspectedId; }, [inspectedId]);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 4500); return () => window.clearTimeout(timer); }, [message]);
  const [, refresh] = useState(0);
  const [span, setSpan] = useState(() => fitTacticalView(engine).span);
  const invalidate = () => { setSpan(view.current.span); refresh(tick => tick + 1); };
  const observers = tacticalObservers(engine);
  const living = engine.capitalShips.filter(ship => tacticalContactVisible(ship, observers));
  const friendly = living.filter(ship => sameTeam(ship,engine.playerShip));
  const inspected = living.find(ship => ship.id === (inspectedId ?? engine.selectedUnitId));
  const selected = engine.selectedUnitId;
  const hasSelection = selected === 'fleet' ? friendly.length > 0 : friendly.some(ship => ship.id === selected);

  const retreat = async(full=false)=>{
    const ids=friendly.filter(s=>!s.retreating&&(full||selected==='fleet'||s.id===selected)).map(s=>s.id);
    try{if(props.onRetreat)await props.onRetreat(ids,full);else engine.deployment.requestRetreat(ids,engine.playerShip.teamId,full);setMessage('撤退指令已确认；舰船驶离本方边缘后释放部署点。');}catch(e){setMessage(e instanceof Error?e.message:String(e));}
  };
  const fullAssault = engine.orders.get('fleet')?.type === 'ASSAULT';
  const close = () => { engine.toggleTacticalMap(); props.onClosed?.(); props.canvasRef?.current?.focus({ preventScroll: true }); };
  const selectFleet = () => { engine.selectUnit('fleet'); setInspectedId(null); invalidate(); };
  const fit = () => { view.current = fitTacticalView(engine); invalidate(); };
  const cancel = () => {
    if(props.readOnlyCommands)return;
    if (!hasSelection || !selected) return;
    // A fleet order is owned by the fleet. Do not pretend a per-ship cancellation removes it.
    if (!engine.orders.has(selected) && engine.orders.has('fleet')) {
      setMessage('该舰正在执行全舰指令；按 A 选择全舰后取消。'); return;
    }
    engine.cancelOrder(selected); setMessage('已取消指令，不消耗或返还指挥点。'); invalidate();
  };
  const issue = (order: Omit<TacticalOrder, 'id' | 'issuedTime'>, fleet = false) => {
    if(props.readOnlyCommands){setMessage('联机地图仅提供观察、增援和撤退；战术指令尚未接入主机。');return;}
    const unitId = fleet ? 'fleet' : engine.selectedUnitId;
    if ((!fleet && !hasSelection) || !unitId || !friendly.length) { setMessage('请先左键选择友舰，或按 A 选择全舰。'); return; }
    if (order.targetShipId && order.type !== 'ESCORT' && !living.some(ship => ship.id === order.targetShipId && !sameTeam(ship,engine.playerShip))) { setMessage('目标已离开己方视野。'); return; }
    const accepted = engine.issueOrder(unitId, { ...order, id: 'map-order-' + (++sequence.current) + '-' + engine.combatTime, issuedTime: engine.combatTime });
    if (!accepted) { setMessage(engine.commandPoints <= 0 ? '指挥点不足。每 120 秒战斗时间恢复 1 点。' : '该舰或目标已离开战场。'); invalidate(); return; }
    const includesFlagship = unitId === 'fleet' || unitId === engine.playerShip.id;
    if (includesFlagship) onAutopilotChange(true);
    setMessage((order.type === 'WAYPOINT' ? '移动指令已下达' : order.type === 'ASSAULT' ? '已取消原指令，自主进攻' : order.type === 'DEFEND' ? '原地防守指令已下达' : order.type === 'AVOID' ? '回避指令已下达' : '集火指令已下达')
      + (includesFlagship ? ' · 旗舰自动驾驶，U 可手动接管。' : '。'));
    invalidate();
  };


  const escortCandidates = (rank: number) => friendly.filter(ship => ship.id !== inspected?.id && !engine.orders.has(ship.id)
    && (rank === 3 || ['FRIGATE', ...(rank === 2 ? ['DESTROYER'] : [])].includes(ship.spec.hullSize ?? '')))
    .sort((a,b) => a.pos.distanceTo(inspected?.pos ?? engine.playerShip.pos) - b.pos.distanceTo(inspected?.pos ?? engine.playerShip.pos)).slice(0, rank === 3 ? 2 : 1);
  const commandDisabled = engine.commandPoints <= 0 ? '指挥点不足；每 120 秒战斗时间恢复 1 点。' : !friendly.length ? '没有可以接令的友舰。' : undefined;
  const action = (id: string, icon: string, label: string, key: string, description: string, unavailable?: string, active?: boolean): TacticalAction => ({id,icon,label,key,description,unavailable,active});
  const direct = (inspected && sameTeam(inspected,engine.playerShip)) || selected === 'fleet';
  const groups: TacticalActionGroup[] = inspected && !sameTeam(inspected,engine.playerShip) ? [
    {label:'其它',actions:[action('target','icon_set_target','设为旗舰目标','R','只设置旗舰的火控目标，不分配机动任务。'),action('info','icon_more_info','舰船信息','F2','查看选中舰船及战术地图操作说明。')]},
    {label:'任务指派',actions:[action('ignore','icon_ignore','撤销对该舰的任务','','撤销所有以该敌舰为目标的已下达指令。'),
      action('avoid','icon_avoid','回避','V','接令舰持续与该敌舰拉开距离，仍保留自卫火控。',commandDisabled),
      action('strike','icon_strike','舰载机打击','S','分配舰载机打击任务。','当前没有独立的联队打击任务调度。'),
      action('harass','icon_harass','骚扰','H','执行骚扰任务。','尚未实现区别于普通交战的骚扰策略。'),
      action('intercept','just_kill_it','强制截击','C','不计风险地截击目标。','尚未实现独立于普通交战的强制截击策略。'),
      action('engage','icon_engage','集中攻击','E','向已选友舰下达集火；未选友舰时交给全舰。使用当前通用交战 AI。',commandDisabled),
      action('dismiss','icon_cancel_order','关闭任务栏','','关闭当前接触的任务栏，不撤销已下达的命令。')]},
  ] : direct ? [
    {label:'任务指派',actions:[...[1,2,3].map(rank=>action('escort'+rank,'icon_escort_'+['light','medium','heavy'][rank-1],['轻型护航','中型护航','重型护航'][rank-1],['L','M','H'][rank-1],rank===3?'派出至多两艘附近友舰跟随护航。':'派出一艘符合舰级的附近友舰跟随护航。',!inspected?'先选择一艘需要护航的友舰。':commandDisabled||(escortCandidates(rank).length?undefined:'没有空余的适合舰级友舰可以派出。'))),
      action('defend','icon_defend','原地防守','D','保持当前位置，自动转向敌舰并交战。',!inspected?'请先选择一艘友舰。':commandDisabled),
      action('dismiss','icon_cancel_order','关闭任务栏','','关闭当前接触的任务栏。')]},
    {label:'其它',actions:[action('autopilot','icon_autopilot','旗舰自动驾驶','U','切换旗舰自动驾驶。手动操纵请先关闭地图。',undefined,autopilot),
      action('transfer','icon_transfer_command','转移指挥','','当前指挥旗舰不可在局内更换。','尚未实现局内旗舰切换。'),
      action('center','icon_video_feed','定位所选舰船','F','把地图视角移到所选舰船。'),action('info','icon_more_info','舰船信息','F2','查看舰船及地图操作说明。')]},
    {label:'直接命令',actions:[action('search','icon_search_and_destroy','自主进攻','S','解除该舰原有任务，恢复自主选择敌舰进攻。',commandDisabled),
      action('retreat','icon_retreat','撤退','T','驶向本方边缘，离场后释放部署点。',engine.deployment.enabled?undefined:'本场没有后备舰队撤退规则。'),
      action('directRetreat','icon_retreat_direct','紧急撤退','E','命令该舰立即撤离战场。','当前试航没有紧急撤离策略与撤离结算。'),
      action('cancel','icon_rescind_order','取消指令','','撤销选中舰船的直接指令；全舰命令需先按 A 选择全舰。也可按 Delete。')]},
  ] : [];
  const runAction = (item: TacticalAction) => {
    if (inputBlocked) return;
    if (item.unavailable) { setMessage(item.unavailable); return; }
    const enemy = inspected && !sameTeam(inspected,engine.playerShip) ? inspected : undefined;
    if (enemy && !tacticalContactVisible(enemy,tacticalObservers(engine))) { setMessage('目标已离开己方视野。'); return; }
    if (item.id === 'target' && enemy) { engine.setPlayerTarget(enemy.id); setMessage('旗舰目标：'+nameOf(enemy)); }
    else if (item.id === 'engage' && enemy) issue({type:'ENGAGE',targetShipId:enemy.id},!hasSelection);
    else if (item.id === 'avoid' && enemy) issue({type:'AVOID',targetShipId:enemy.id},!hasSelection);
    else if (item.id === 'ignore' && enemy) { for(const [id,order] of engine.orders)if(order.targetShipId===enemy.id)engine.cancelOrder(id); setMessage('已撤销针对此舰的任务。'); }
    else if (item.id === 'defend') issue({type:'DEFEND',targetPos:(inspected??engine.playerShip).pos.clone()});
    else if (item.id === 'search') issue({type:'ASSAULT'});
    else if (item.id === 'cancel') cancel();
    else if (item.id === 'retreat') void retreat();
    else if (item.id === 'dismiss') { setInspectedId(null); engine.selectUnit(null); setShowInfo(false); }
    else if (item.id === 'autopilot') onAutopilotChange(!autopilot);
    else if (item.id === 'center') view.current.center=(inspected??engine.playerShip).pos.clone();
    else if (item.id === 'info') setShowInfo(value=>!value);
    else if (item.id.startsWith('escort') && inspected) {
      const ships=escortCandidates(Number(item.id.slice(-1)));
      const order:TacticalOrder={id:'escort-'+(++sequence.current)+'-'+engine.combatTime,type:'ESCORT',targetShipId:inspected.id,issuedTime:engine.combatTime};
      if(engine.issueEscortGroup(ships.map(ship=>ship.id),order)){if(ships.includes(engine.playerShip))onAutopilotChange(true);setMessage('已派出 '+ships.length+' 艘友舰护航。');}else setMessage('护航指令未生效，请检查指挥点或舰船状态。');
    }
    invalidate();
  };

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected && !document.querySelector('[role="dialog"]')) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (inputBlocked) { drag.current = null; hover.current = null; }
  }, [inputBlocked]);

  useEffect(() => {
    const canvas = mapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const painter = new TacticalMapPainter();
    let frame = 0, last = -1000, size = canvas.clientWidth, height = canvas.clientHeight;
    const resize = () => {
      size = canvas.clientWidth; height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(size * dpr)); canvas.height = Math.max(1,Math.round(height*dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const draw = (now: number) => {
      if (now - last >= 1000 / 30 && size > 0) {
        last = now;
        const current = live.current;
        painter.draw(ctx, size, view.current, engine, {
          pos: current.cameraPosRef?.current ?? engine.playerShip.pos,
          zoom: current.zoomRef?.current ?? 1,
          width: current.canvasRef?.current?.clientWidth ?? window.innerWidth,
          height: current.canvasRef?.current?.clientHeight ?? window.innerHeight,
        }, hover.current, height, inspectedRef.current);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const wheel = (event: WheelEvent) => {
      if (!engine.isTacticalMap || live.current.inputBlocked || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault(); event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      zoomTacticalView(view.current, new Vector2(event.clientX - rect.left, event.clientY - rect.top), size, Math.exp(Math.max(-.3, Math.min(.3, event.deltaY * .0015))), height);
      invalidate();
    };
    const clearPointer = () => {
      const pointer = drag.current; drag.current = null; hover.current = null;
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    };
    const onVisibility = () => { if (document.hidden) clearPointer(); };
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', clearPointer);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', clearPointer); document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [engine]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!engine.isTacticalMap || event.defaultPrevented || event.isComposing || inputBlocked || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Escape still belongs to the game's pause menu. All flight keys are otherwise isolated.
      if (event.code === 'Escape') return;
      const shortcut = (props.readOnlyCommands?[]:groups).flatMap(group=>group.actions).find(item=>item.key && (event.code==='F2'?item.key==='F2':event.code==='Key'+item.key));
      if(shortcut){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)runAction(shortcut);return;}
      const keys = ['Tab', 'Space', 'KeyA', 'KeyC', 'KeyU', 'KeyZ', 'KeyG', 'Delete', 'Backspace', 'Home', 'Equal', 'Minus', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyX', 'KeyV', 'KeyF', 'KeyR','KeyL','KeyM','KeyH','KeyT','F2'];
      if (!keys.includes(event.code) && !/^(Digit|Numpad)[1-7]$/.test(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat && !event.code.startsWith('Arrow')) return;
      if (event.code === 'Tab') close();
      else if (event.code === 'Space') onPausedChange(!paused);
      else if (event.code === 'KeyA') selectFleet();
      else if (event.code === 'Home') fit();
      else if (event.code === 'KeyC') { view.current.center = engine.playerShip.pos.clone(); invalidate(); }
      else if (event.code === 'KeyU' && !props.readOnlyCommands) { onAutopilotChange(!autopilot); setMessage(autopilot ? '旗舰切回手动；关闭地图后操纵。' : '旗舰自动驾驶已开启。'); }
      else if (event.code === 'KeyZ' && !props.readOnlyCommands) { engine.toggleFighterRecall(); invalidate(); }
      else if (event.code === 'KeyG') { if (props.onOpenDeployment) props.onOpenDeployment(); else setMessage('本场舰船均已部署，没有待命增援。'); }
      else if (event.code === 'Delete' || event.code === 'Backspace') cancel();
      else if (event.code === 'Equal' || event.code === 'Minus') {
        const size = mapRef.current?.clientWidth ?? 1;
        zoomTacticalView(view.current, new Vector2(size / 2, (mapRef.current?.clientHeight ?? size) / 2), size, event.code === 'Equal' ? .85 : 1.18, mapRef.current?.clientHeight ?? size); invalidate();
      } else if (event.code.startsWith('Arrow')) {
        const amount = view.current.span * .04;
        view.current.center.x += event.code === 'ArrowRight' ? amount : event.code === 'ArrowLeft' ? -amount : 0;
        view.current.center.y += event.code === 'ArrowDown' ? amount : event.code === 'ArrowUp' ? -amount : 0;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const pointAt = (x: number, y: number) => { const rect = mapRef.current!.getBoundingClientRect(); return new Vector2(x - rect.left, y - rect.top); };
  const buttonsDisabled = inputBlocked || !friendly.length;
  return <section ref={rootRef} tabIndex={-1} aria-label="战术地图" className="tactical-map" data-combat-input-block inert={inputBlocked}>
    <div className="tactical-map-shade" />
    <div className="tactical-map-state">{paused ? '游戏暂停。按 空格键 取消暂停。' : '战术指挥。按 空格键 暂停游戏。'}<small>Tab 返回战斗 · Esc 暂停菜单</small></div>
    <div className="tactical-map-square">
      <canvas ref={mapRef} aria-label="实时战术地图：左键选择友舰，右键移动或集火，拖动平移，滚轮缩放" role="img"
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          if (inputBlocked) return;
          event.preventDefault(); rootRef.current?.focus({ preventScroll: true });
          if (event.button === 0 || event.button === 1) {
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, center: view.current.center.clone(), moved: event.button === 1 };
            event.currentTarget.setPointerCapture(event.pointerId);
          } else if (event.button === 2) {
            const point = pointAt(event.clientX, event.clientY), size = event.currentTarget.clientWidth;
            const target = pickMapShip(engine, point, view.current, size, event.currentTarget.clientHeight);
            if ((target && sameTeam(target,engine.playerShip))) { setMessage('右键敌舰下达集火；右键空白处设置航路点。'); return; }
            issue(target ? { type: 'ENGAGE', targetShipId: target.id } : { type: 'WAYPOINT', targetPos: mapWorld(point, view.current, size, event.currentTarget.clientHeight) });
          }
        }}
        onPointerMove={event => {
          if (inputBlocked) return;
          const current = drag.current;
          if (current && current.id === event.pointerId) {
            const dx = event.clientX - current.x, dy = event.clientY - current.y;
            current.moved ||= Math.hypot(dx, dy) > 4;
            if (current.moved) view.current.center = new Vector2(current.center.x - dx * view.current.span / event.currentTarget.clientWidth, current.center.y - dy * view.current.span / event.currentTarget.clientWidth);
          } else hover.current = pickMapShip(engine, pointAt(event.clientX, event.clientY), view.current, event.currentTarget.clientWidth, event.currentTarget.clientHeight)?.id ?? null;
        }}
        onPointerUp={event => {
          const current = drag.current; drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (!current || current.id !== event.pointerId || current.moved || inputBlocked) return;
          const ship = pickMapShip(engine, pointAt(event.clientX, event.clientY), view.current, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
          if((ship && sameTeam(ship,engine.playerShip)))engine.selectUnit(ship.id);else if(!ship)engine.selectUnit(null);
          setInspectedId(ship?.id ?? null); setShowInfo(false); invalidate();
        }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onPointerLeave={() => { hover.current = null; }} />
      <div className="tactical-map-scale">{Math.round(span).toLocaleString()} su <span>地图视野 3000 · Home 全览 · Tab 返回</span></div>
    </div>
    <div hidden={props.readOnlyCommands} className="tactical-map-transport" aria-label="战斗时间控制">
      <button aria-label="继续战斗" aria-pressed={!paused} title="继续战斗 [Space]" onClick={() => onPausedChange(false)}><img src={asset('play_34x')} alt="" /></button>
      <button aria-label="暂停战斗" aria-pressed={paused} title="暂停战斗 [Space]" onClick={() => onPausedChange(true)}><img src={asset('pause_34x')} alt="" /></button>
    </div>
    <aside className="tactical-map-commands" aria-label="舰队指挥">
      <div className="tactical-map-command-head">
        <button className="tactical-map-reinforce" disabled={!props.onOpenDeployment || inputBlocked || !!engine.battleResult} onClick={props.onOpenDeployment} title={props.onOpenDeployment ? "打开舰船部署 / 增援 [G]" : "本场舰船均已部署，没有待命增援"}><NativeBitmapText font="button" color="currentColor">增援</NativeBitmapText> <em>[G]</em></button>
        <div className="tactical-map-counters">
          <Counter label="已部署" icon="icon_fleetpoints" value={String(engine.isSimulation ? engine.simulationDeployedPoints(true) : engine.deployment.enabled ? engine.deployment.used(engine.playerShip.teamId) : friendly.length).padStart(2, '0')} title={engine.isSimulation || engine.deployment.enabled ? "当前在场盟军使用的部署点" : "在场友方主舰数量（不含舰载机），不是部署点预算"} />
          <Counter label="指挥点" icon="icon_commandpoints" value={String(engine.commandPoints).padStart(2, '0')} title="每条指令消耗 1 点；每 120 秒战斗时间恢复 1 点" tone="yellow" />
          <Counter label="安全撤离" icon="clean_disengage" value="—" title="没有免战安全脱离判定；已接入后备舰队的战斗可下令驶离边缘撤退" />
        </div>
      </div>
      <MapAction icon="icon_search+destroy" pressed={fullAssault} disabled={props.readOnlyCommands || buttonsDisabled || (!fullAssault && engine.commandPoints <= 0)}
        title="取消友舰原有航点和集火任务，交由 AI 自主选择敌舰进攻；消耗 1 指挥点"
        onClick={() => { if (fullAssault) { engine.cancelOrder('fleet'); setMessage('已解除全面进攻；各舰恢复自主交战。'); invalidate(); } else issue({ type: 'ASSAULT' }, true); }}>全面进攻!</MapAction>
      {props.readOnlyCommands && <MapAction icon="icon_retreat" disabled={!engine.deployment.enabled || !hasSelection || inputBlocked || !!engine.battleResult} title="让选中的本队 AI 或自己驾驶的舰船驶离边缘；不能替其他真人撤退" onClick={()=>void retreat()}>选中舰撤退</MapAction>}
      <MapAction icon="icon_full_retreat" disabled={!engine.deployment.enabled || inputBlocked || !!engine.battleResult} title="全部在场友舰撤离，未出场后备舰保留，不再自动增援" onClick={()=>void retreat(true)}>全面撤退!</MapAction>
      <p className="tactical-map-unavailable">{engine.isSimulation ? "G 打开模拟部署" : engine.deployment.enabled ? "G 呼叫后备舰 · 撤离后释放部署点" : "本场无预备舰"}</p>
    </aside>
    <TacticalShipStatus ship={engine.playerShip} />
    {!props.readOnlyCommands&&groups.length>0&&<TacticalCommandDock groups={groups} onAction={runAction} />}
    {showInfo&&<aside className="tactical-map-info" aria-label="战术信息"><strong>{inspected?nameOf(inspected):'全舰指令'}</strong><p>{inspected?'结构 '+Math.ceil(inspected.hullHp)+' / '+inspected.maxHullHp+' · 幅能 '+Math.round(inspected.flux.fluxPercent*100)+'%':''}</p><p>左键选择接触；右键空白处移动，右键敌舰集火。A 选择全舰，Del 取消指令。</p><p>拖动或方向键平移；滚轮 / ± 缩放。Home 全览，Tab 返回战斗。</p><p>灰蓝色为未探明区域，黑色为己方地图视野；当前使用原版基础半径 3000，尚未接入视野插件或战斗 AI 传感器。</p><button onClick={()=>setShowInfo(false)}>关闭 [F2]</button></aside>}
    <footer className="tactical-map-help"><div role="status">{message}</div></footer>
  </section>;
}
function Counter({ label, icon, value, title, tone = 'blue' }: { label: string; icon: string; value: string; title: string; tone?: string }) {
  return <div className="tactical-map-counter" title={title}><span>{label}</span><div><img src={asset(icon)} alt="" /><b data-tone={tone}><NativeBitmapText font="action" color="currentColor">{value}</NativeBitmapText></b></div></div>;
}
function MapAction({ children, icon, pressed, disabled, title, onClick }: { children: string; icon: string; pressed?: boolean; disabled?: boolean; title: string; onClick?: () => void }) {
  return <button className="tactical-map-action" aria-pressed={pressed} disabled={disabled} title={title} onClick={onClick}><span><NativeBitmapText font="button" color={pressed ? "#ffe36c" : "#a0d8ed"}>{children}</NativeBitmapText></span><img src={asset(icon)} alt="" /></button>;
}
