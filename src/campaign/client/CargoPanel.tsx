import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { createMarketTransfer, marketTransferItems, marketTransferPending, marketTransferMatches, cancelMarketTransfer, type MarketTransferState } from './MarketTransfer.mjs';
import type { OriginalMarketBasketItem } from '../rules/OriginalMarket.mjs';
import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type Ref, type ReactNode } from 'react';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import reference from '../data/reference-market.json';
import { createCargoTransfer, cancelCargoTransfer, clickCargoSlot, quickCargoTransfer, shiftCargoSlot, setCargoSelection, finishCargoSelection, returnHeldCargo, cargoTransferPending, cargoTransferItems, cargoTransferRetained, cargoTransferMatches, sortCargoTransfer, type CargoSide, type TransferStack, type CargoTransferState } from './CargoTransfer.mjs';
import { createCargoQuantityDrag, moveCargoQuantityDrag, cargoQuantityDragValue, cargoQuantityLabels, type CargoQuantityDrag } from './CargoQuantity.mjs';
import type { CargoHudDraft } from './useCargoHudPreview';
import type { CargoQuickRequest, FleetView } from './Protocol';
import './CargoPanel.css';

type Category = 'all' | 'resources' | 'weapons' | 'other';
interface Commodity { id: string; name: string; icon: string; tags: string[]; cargoSpace: number; order: number }
// Display metadata never supplies inventory or authorizes a server command.
const commodities = new Map<string, Commodity>(Object.entries(reference.commodities));
const amount = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 });
const categories: { id: Category; label: string; key: string }[] = [
  { id: 'all', label: '全部', key: '1' }, { id: 'resources', label: '资源', key: '2' },
  { id: 'weapons', label: '舰载武器', key: '3' }, { id: 'other', label: '其它', key: '4' },
];
const nameOf = (id: string) => commodities.get(id)?.name ?? id;
const categoryOf = (id: string) => {
  const spec = commodities.get(id);
  // Hand weapons are a commodity, not a ship-mounted weapon stack.
  return spec && !spec.tags.some(tag => tag === 'nonecon' || tag === 'meta') ? 'resources' : 'other';
};
function transferable(stack: TransferStack) {
  const spec = commodities.get(stack.id);
  return !!spec && !spec.tags.includes('meta') && (!spec.tags.includes('personnel') || Number.isInteger(stack.quantity));
}
function CargoIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false), icon = commodities.get(id)?.icon;
  if (!icon || failed) return <span className="cargo-panel-missing-icon"><span>{id}</span><small>无可用图标</small></span>;
  return <img className="cargo-panel-item-icon" src={runtimeAssetUrl('/game-assets/' + icon)} alt="" draggable={false} onError={() => setFailed(true)} />;
}
export interface CargoPanelControls {
  isPending: () => boolean;
  /** true consumes this key; the shell must not also close or switch pages. */
  keyDown: (event: globalThis.KeyboardEvent) => boolean;
  escape: () => boolean;
  cancelHeld: () => boolean;
}
export interface CargoExchange {
  tabs?: ReactNode; inventory: Record<string, number>; label: string; summary: ReactNode; canConfirm: boolean;
  unavailableCommodityIds: string[];
  onDraft: (items: OriginalMarketBasketItem[] | null, held: boolean, stale: boolean) => void;
  onConfirm: (items: OriginalMarketBasketItem[]) => Promise<boolean>;
}
interface CargoPanelProps {
  exchange?: CargoExchange;
  previewScope: string; previewDescription: string; onPreviewChange: (draft: CargoHudDraft | null) => void;
  receiptKey: string; fleet?: FleetView; locked: boolean;
  controlsRef?: Ref<CargoPanelControls>; onActivityChange?: (active: boolean) => void;
  onQuickTransfer: (cargo: Record<string, number>, quick: CargoQuickRequest, signal: AbortSignal) => Promise<number>;
  onJettison: (items: Record<string, number>) => Promise<boolean>;
}
export function CargoPanel(props: CargoPanelProps) {
  return <CargoContents key={props.previewScope} {...props} />;
}
function CargoContents({ exchange, fleet, locked, onJettison, controlsRef, onActivityChange, previewScope, previewDescription, onPreviewChange, onQuickTransfer }: CargoPanelProps) {
  const uid = useId(), cargo = fleet?.private?.cargo;
  const cargoAvailable = cargo !== undefined && cargo !== null && typeof cargo === 'object' && !Array.isArray(cargo);
  const create = () => exchange ? sortCargoTransfer(createMarketTransfer(cargo, exchange.inventory), 'discard', commodities) : createCargoTransfer(cargo);
  const isPending = (state: CargoTransferState) => exchange ? marketTransferPending(state as MarketTransferState) : cargoTransferPending(state);
  const matches = (state: CargoTransferState) => exchange ? marketTransferMatches(state as MarketTransferState, cargo, exchange.inventory) : cargoTransferMatches(state, cargo);
  const [transfer, setTransfer] = useState(create);
  const current = useRef(transfer);
  useLayoutEffect(() => { current.current = transfer; }, [transfer]);
  const [submitting, setSubmitting] = useState(false), submittingRef = useRef(false);
  const [category, setCategory] = useState<Category>('all'), [note, setNote] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]), scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [heldAt, setHeldAt] = useState({ x: 0, y: 0 });
  const [quantityDrag, setQuantityDrag] = useState<CargoQuantityDrag | null>(null);
  const gesture = useRef<{ pointerId: number; owner: HTMLButtonElement; drag: CargoQuantityDrag } | null>(null);
  const suppressClick = useRef(false);
  const [quickPending, setQuickPending] = useState(false);
  const quickQuery = useRef<AbortController | null>(null);
  const quickContext = JSON.stringify([fleet?.version, fleet?.canCommand, fleet?.private?.members.map(m => [m.id, m.version]), cargo, locked]);
  useLayoutEffect(() => {
    if (quickQuery.current) { cancelQuickQuery(); setNote('舰队状态已变化，本次快捷转移未执行；请重试。'); }
    return () => { quickQuery.current?.abort(); };
  }, [quickContext]);
  useLayoutEffect(() => () => { quickQuery.current?.abort(); quickQuery.current = null; }, []);
  const active = isPending(transfer), blocked = locked || submitting || quickPending;
  function cancelQuickQuery() { quickQuery.current?.abort(); quickQuery.current = null; setQuickPending(false); }
  async function quickMove(side: CargoSide, index: number) {
    if (exchange) { setNote('市场 Ctrl 容量／价格快捷转移尚未接入，请用左键或 Shift 选量。'); return; }
    const state = current.current, stack = state[side][index];
    if (quickQuery.current || blocked || stale || invalid || state.held || !stack) return;
    if (!transferable(stack)) { setNote('该货物类型或数量尚不支持转移。'); return; }
    const controller = new AbortController(); quickQuery.current = controller; setQuickPending(true);
    setNote('正在向服务器查询快捷转移数量；Esc 可取消，库存尚未改变。');
    const timeout = setTimeout(() => { if (quickQuery.current === controller) { cancelQuickQuery(); setNote('快捷转移查询超时，本次未转移；可重试。'); } }, 10000);
    try {
      const amount = await onQuickTransfer(cargoTransferRetained(state), { side, id: stack.id, quantity: stack.quantity }, controller.signal);
      if (controller.signal.aborted || quickQuery.current !== controller || current.current !== state) return;
      const next = quickCargoTransfer(state, side, index, amount);
      replace(next); setNote(next === state ? '本次快捷转移未执行：数量、规则或容器限制。' : '');
    } catch {
      if (!controller.signal.aborted && quickQuery.current === controller) setNote('快捷转移查询失败，本次未转移；可重试或撤销。');
    } finally {
      clearTimeout(timeout);
      if (quickQuery.current === controller) { quickQuery.current = null; setQuickPending(false); }
    }
  }
  const stale = !matches(transfer);
  // With no pending transaction a fresh authority snapshot replaces the local view.
  // With a transaction, keep it visible and require cancellation rather than silently rebasing.
  if (!active && stale && (cargoAvailable || transfer.hold.length > 0)) setTransfer(create());
  const invalid = Object.values(cargo ?? {}).some(n => !Number.isFinite(n) || n < 0);
  const generation = useRef(0);
  const previewData = active ? JSON.stringify({ cargo: cargoTransferRetained(transfer), stale: stale || invalid }) : '';
  useLayoutEffect(() => {
    onPreviewChange(previewData ? { ...JSON.parse(previewData), scope: previewScope, instance: uid, generation: ++generation.current } as CargoHudDraft : null);
    return () => onPreviewChange(null);
  }, [previewData, previewScope, onPreviewChange, uid]);
  const exchangeDraft = exchange ? JSON.stringify([marketTransferItems(transfer as MarketTransferState), !!transfer.held, stale]) : '';
  const onExchangeDraft = exchange?.onDraft;
  useLayoutEffect(() => { if (exchangeDraft && onExchangeDraft) { const [items, held, outOfDate] = JSON.parse(exchangeDraft); onExchangeDraft(items, held, outOfDate); } }, [exchangeDraft, onExchangeDraft]);
  const draft = cargoTransferItems(transfer), draftRows = Object.entries(draft);
  const summary = { ...draft };
  if (transfer.held && transfer.held.stack.quantity > 0) {
    const { id, quantity } = transfer.held.stack;
    Object.defineProperty(summary, id, { value: (Object.hasOwn(summary, id) ? summary[id] : 0) + quantity, enumerable: true, configurable: true, writable: true });
  }
  const summaryRows = Object.entries(summary);
  function replace(next: CargoTransferState) { current.current = next; setTransfer(next); }
  function escape() {
    if (quickQuery.current) { cancelQuickQuery(); setNote(''); return true; }
    if (!isPending(current.current) && !submittingRef.current) return false;
    // An uncertain network request cannot be locally "undone". Preserve it for retry.
    if (locked || submittingRef.current) return true;
    if (current.current.held) { clearQuantityGesture(); replace(returnHeldCargo(current.current)); }
    else cancelDraft();
    setNote(''); return true;
  }
  function cancelHeld() {
    if (!current.current.held) return false;
    if (!locked && !submittingRef.current) { clearQuantityGesture(); replace(returnHeldCargo(current.current)); setNote(''); }
    return true;
  }
  function cancelDraft() {
    const state = current.current;
    // Native cancellation returns staged items into the current layout. A stale
    // multiplayer snapshot instead needs an explicit rebase to authoritative cargo.
    replace(matches(state) ? (exchange ? cancelMarketTransfer(state as MarketTransferState) : cancelCargoTransfer(state)) : create());
  }
  function reset() {
    if (quickQuery.current) { cancelQuickQuery(); cancelDraft(); setNote(''); return; }
    if (blocked || submittingRef.current || current.current.held) return;
    cancelDraft(); setNote('');
  }
  async function confirmJettison() {
    if (exchange) {
      const state = current.current, items = marketTransferItems(state as MarketTransferState);
      if (blocked || submittingRef.current || state.held || !matches(state) || !exchange.canConfirm || !items?.length) return;
      submittingRef.current = true; setSubmitting(true); setNote('');
      try { if (await exchange.onConfirm(items)) replace(create()); }
      catch { setNote('交易尚未确认；请检查回执，不要重复创建新交易。'); }
      finally { submittingRef.current = false; setSubmitting(false); }
      return;
    }
    const state = current.current, items = cargoTransferItems(state);
    if (blocked || submittingRef.current || state.held || !matches(state) || invalid || !Object.keys(items).length) return;
    submittingRef.current = true; setSubmitting(true); setNote('');
    try { if (await onJettison(items)) replace(create()); }
    catch { setNote('请求失败；转移内容已保留。请先检查连接与指令回执。'); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  function chooseCategory(next: Category, focus = false) {
    if (current.current.held) return;
    setCategory(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (focus) tabRefs.current[categories.findIndex(tab => tab.id === next)]?.focus();
  }
  function keyDown(event: Pick<globalThis.KeyboardEvent, 'key' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
    if (event.repeat) return false;
    if (event.key === 'Escape') return escape();
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.key.toLowerCase() === 't' && (isPending(current.current) || quickQuery.current)) { reset(); return true; }
    if (event.key.toLowerCase() === 'g' && isPending(current.current)) { void confirmJettison(); return true; }
    const next = categories.find(tab => tab.key === event.key);
    if (next) { chooseCategory(next.id, true); return true; }
    return false;
  }
  useImperativeHandle(controlsRef, () => ({ isPending: () => isPending(current.current) || submittingRef.current || !!quickQuery.current, escape, cancelHeld, keyDown }));
  useLayoutEffect(() => { onActivityChange?.(active || submitting || quickPending); }, [active, submitting, quickPending, onActivityChange]);
  useLayoutEffect(() => () => { onActivityChange?.(false); }, [onActivityChange]);
  function panelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    if (keyDown(event)) { event.preventDefault(); event.stopPropagation(); }
  }
  function tabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = categories.findIndex(tab => tab.id === category);
    const next = event.key === 'ArrowRight' ? (index + 1) % categories.length
      : event.key === 'ArrowLeft' ? (index + categories.length - 1) % categories.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation(); chooseCategory(categories[next].id, true);
  }
  function clearQuantityGesture() {
    const activeGesture = gesture.current;
    gesture.current = null; setQuantityDrag(null);
    if (activeGesture?.owner.hasPointerCapture(activeGesture.pointerId)) activeGesture.owner.releasePointerCapture(activeGesture.pointerId);
  }
  // An interrupted browser drag must not strand the selection overlay. Unlike an
  // uncertain command this is local, reversible presentation state only.
  useEffect(() => {
    const cancelDrag = () => {
      if (!gesture.current) return;
      clearQuantityGesture(); replace(returnHeldCargo(current.current));
    };
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('resize', cancelDrag);
    return () => { window.removeEventListener('blur', cancelDrag); window.removeEventListener('resize', cancelDrag); };
  }, []);
  function slotPointerDown(event: PointerEvent<HTMLButtonElement>, side: CargoSide, index: number) {
    // A fresh ordinary press resets suppression left by an outside/cancelled release.
    if (event.button === 0) suppressClick.current = false;
    if (event.button !== 0 || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || blocked || stale || invalid) return;
    const state = current.current, target = state[side][index];
    if (target && !transferable(target)) return;
    event.preventDefault(); event.stopPropagation(); suppressClick.current = true;
    const next = shiftCargoSlot(state, side, index);
    replace(next); setHeldAt({ x: event.clientX, y: event.clientY }); setNote('');
    if (next !== state && next.held?.selectionTotal !== undefined) {
      const drag = createCargoQuantityDrag(next.held.selectionTotal, event.clientX, event.clientY, window.innerWidth, window.innerHeight, event.timeStamp);
      gesture.current = { pointerId: event.pointerId, owner: event.currentTarget, drag };
      setQuantityDrag(drag); event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function slotPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const activeGesture = gesture.current;
    if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (blocked || stale || invalid) { clearQuantityGesture(); replace(finishCargoSelection(current.current)); return; }
    const drag = moveCargoQuantityDrag(activeGesture.drag, event.clientX);
    activeGesture.drag = drag; setQuantityDrag(drag);
    replace(setCargoSelection(current.current, cargoQuantityDragValue(drag, event.timeStamp)));
    setHeldAt({ x: event.clientX, y: event.clientY });
  }
  function slotPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const activeGesture = gesture.current;
    if (!activeGesture || event.pointerId !== activeGesture.pointerId || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const next = blocked || stale || invalid ? finishCargoSelection(current.current)
      : finishCargoSelection(setCargoSelection(current.current, cargoQuantityDragValue(activeGesture.drag, event.timeStamp)));
    clearQuantityGesture(); replace(next); setHeldAt({ x: event.clientX, y: event.clientY });
  }
  function slotPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    clearQuantityGesture(); replace(returnHeldCargo(current.current));
  }
  function slotContextMenu(event: MouseEvent<HTMLButtonElement>, side: CargoSide, index: number) {
    if (!event.shiftKey && !gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    if (gesture.current) { cancelHeld(); return; }
    if (blocked || stale || invalid || event.ctrlKey || event.altKey || event.metaKey) return;
    replace(shiftCargoSlot(current.current, side, index, 'right'));
  }
  function slotClick(event: MouseEvent<HTMLButtonElement>, side: CargoSide, index: number) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (blocked || stale || invalid) return;
    if (event.ctrlKey && !event.altKey && !event.metaKey && !current.current.held) { void quickMove(side, index); return; }
    if (event.shiftKey || event.altKey || event.metaKey) return;
    const state = current.current, target = state[side][index];
    if (target && !transferable(target)) { setNote('该货物类型或数量尚不支持转移。'); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    setHeldAt(event.detail ? { x: event.clientX, y: event.clientY } : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    const next = clickCargoSlot(state, side, index);
    if (next === state && state.held && side === 'discard') setNote('单次转移最多包含 64 种货物；请先确认或撤销当前转移。');
    else setNote('');
    replace(next);
  }
  function sort(side: CargoSide) {
    if (blocked || stale || current.current.held) return;
    replace(sortCargoTransfer(current.current, side, commodities));
    if (side === 'hold' && scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  function renderGrid(side: CargoSide) {
    const slots = transfer[side];
    const rows = slots.map((stack, index) => ({ stack, index })).filter(({ stack, index }) => side === 'discard' && !exchange || category === 'all' || (stack && category === categoryOf(stack.id)) || (transfer.held?.source === side && transfer.held.index === index));
    const minimum = exchange ? 40 : side === 'hold' ? 70 : 20, count = rows.length, total = Math.max(minimum, Math.ceil(count / 10) * 10);
    for (let n = rows.length; n < total; n++) rows.push({ stack: null, index: slots.length + n - count });
    return rows.map(({ stack, index }) => <div className="cargo-panel-cell" role="listitem" key={index} data-slot-index={index} data-commodity-id={stack?.id}>
      {(stack || transfer.held) && <button type="button" className="cargo-panel-stack" disabled={blocked || stale || invalid || !!(stack && (!transferable(stack) || exchange?.unavailableCommodityIds.includes(stack.id)))}
        aria-label={stack ? (transfer.held ? '放到 ' : '拿起 ') + nameOf(stack.id) + ' × ' + amount.format(stack.quantity) : (side === 'hold' ? '放回货舱' : exchange ? '放到市场' : '放入抛弃区') + ' 空格 ' + (index + 1)}
        title={stack ? nameOf(stack.id) + ' × ' + amount.format(stack.quantity) : undefined}
        onPointerDown={event => slotPointerDown(event, side, index)} onPointerMove={slotPointerMove} onPointerUp={slotPointerUp}
        onPointerCancel={slotPointerCancel} onLostPointerCapture={slotPointerCancel} onContextMenu={event => slotContextMenu(event, side, index)}
        onClick={event => slotClick(event, side, index)}>
        {stack && <><CargoIcon key={stack.id} id={stack.id} /><span className="cargo-panel-amount">{amount.format(stack.quantity)}</span></>}
      </button>}
    </div>);
  }
  const visibleCount = transfer.hold.filter(stack => stack && (category === 'all' || category === categoryOf(stack.id))).length;
  const emptyMessage = !cargoAvailable ? '货舱数据不可用；未收到舰队私有库存。'
    : category === 'weapons' ? '当前协议未提供舰载武器堆栈。' : transfer.held ? '' : '此分类下没有货物。';
  return <section className={"cargo-panel" + (exchange ? " cargo-panel-market" : "")} aria-label={exchange ? "市场货物交易" : "乘员与货物"} onKeyDown={panelKeyDown} data-quick-pending={quickPending} data-selecting={!!quantityDrag} data-holding={!!transfer.held && !blocked && !stale && !invalid}
    onPointerMove={event => { if (ghostRef.current) { ghostRef.current.style.left = event.clientX + 'px'; ghostRef.current.style.top = event.clientY + 'px'; } }}
    onContextMenu={event => { if (current.current.held) { event.preventDefault(); event.stopPropagation(); if (!event.shiftKey || gesture.current) escape(); } }}>
    <div className="cargo-panel-layout">
      <aside className="cargo-panel-quartermaster" aria-label="军需官与转移汇总">
        {!exchange && <img className="cargo-panel-flag" src={runtimeAssetUrl('/game-assets/graphics/factions/player_flag.png')} alt="默认玩家旗帜" draggable={false} />}
        {exchange ? exchange.summary : summaryRows.length ? <section className="cargo-panel-transfer-summary" aria-label="当前转移内容" aria-live="polite">
          <h2>当前转移内容</h2><ul>{summaryRows.map(([id, quantity]) => <li key={id}>存放 {nameOf(id)} × {amount.format(quantity)}</li>)}</ul>
        </section> : <p className="cargo-panel-explanation">你的军需官负责统筹所有船员指派、军备库存和货物交易的记录，这些报告都会实时更新到你的 TriPad 上，以供查阅。</p>}
        {active && <div className="cargo-panel-transaction-actions">
          <button type="button" disabled={blocked || !!transfer.held} onClick={reset} aria-label="撤销 [T]">撤销 <span className="cargo-panel-key">[T]</span></button>
          <button type="button" disabled={blocked || stale || invalid || !!transfer.held || (exchange ? !exchange.canConfirm : !draftRows.length)} onClick={() => { void confirmJettison(); }} aria-label="确认 [G]">确认 <span className="cargo-panel-key">[G]</span></button>
        </div>}
        {invalid && <p className="cargo-panel-warning" role="status">库存包含无效数量；转移已禁用。</p>}
      </aside>
      <div className="cargo-panel-inventory">
        <header className="cargo-panel-toolbar">
          <div className="cargo-panel-tabs" role="tablist" aria-label="货物分类" onKeyDown={tabKeyDown}>
            {categories.map((tab, index) => <button type="button" className="cargo-panel-tab" key={tab.id} ref={element => { tabRefs.current[index] = element; }}
              id={uid + '-tab-' + tab.id} role="tab" aria-selected={category === tab.id} aria-controls={uid + '-hold'} tabIndex={category === tab.id ? 0 : -1} disabled={!!transfer.held} onClick={() => chooseCategory(tab.id)}>
              <NativeBitmapText font="caption" color="currentColor">{tab.label}</NativeBitmapText><span className="cargo-panel-key" aria-hidden="true">[{tab.key}]</span>
            </button>)}
          </div>
          <button type="button" className="cargo-panel-sort" disabled={blocked || stale || !!transfer.held || visibleCount < 2} title="按原版商品 order 排序" aria-label="排序持有货物" onClick={() => sort('hold')}><NativeBitmapText font="caption" color="currentColor">排序</NativeBitmapText></button>
        </header>
        <div className="cargo-panel-hold" id={uid + '-hold'} role="tabpanel" aria-labelledby={uid + '-tab-' + category} tabIndex={0}>
          <div className="cargo-panel-grid-scroll" ref={scrollRef}><div className="cargo-panel-grid" role="list" aria-label="持有货物">{renderGrid('hold')}</div></div>
          {!visibleCount && emptyMessage && <p className="cargo-panel-empty-message" role="status">{emptyMessage}</p>}
        </div>
        <section className="cargo-panel-discard" aria-label={exchange?.label ?? "抛弃"}>
          <header className="cargo-panel-toolbar">{exchange?.tabs ?? <span className="cargo-panel-discard-tab" aria-disabled="true"><NativeBitmapText font="caption" color="currentColor">{exchange?.label ?? "抛弃"}</NativeBitmapText></span>}
            <button type="button" className="cargo-panel-sort" disabled={blocked || stale || !!transfer.held || draftRows.length < 2} aria-label={exchange ? "排序市场货物" : "排序抛弃货物"} onClick={() => sort('discard')}><NativeBitmapText font="caption" color="currentColor">排序</NativeBitmapText></button>
          </header>
          <div className="cargo-panel-discard-grid"><div className="cargo-panel-grid" role="list" aria-label={exchange ? "市场货物" : "待抛弃货物"}>{renderGrid('discard')}</div></div>
        </section>
      </div>
    </div>
    <p className="cargo-panel-interaction-note" role="status">{stale && active ? '库存已变化；请先撤销当前转移，再从最新库存拿取。' : note || (exchange ? '左键拿起 / 放下；Shift 选量；右键放回；撤销 [T]、确认交易 [G]。市场 Ctrl 快捷转移尚未接入。' : '左键拿起 / 放下；Shift 点取或拖动选量，在原格 Shift 左/右键加减一个；Esc 放回。Ctrl 快捷转移（先填满 / 移出超额）；吊舱暂不漂移或过期。')}{previewDescription && !(stale && active) && <span> {previewDescription}</span>}</p>
    {quantityDrag && transfer.held && <div className="cargo-panel-quantity" role="status" aria-label="分量选择"
      style={{ left: quantityDrag.left, top: quantityDrag.top, width: quantityDrag.width }}>
      <div className="cargo-panel-quantity-bar"><span className="cargo-panel-quantity-fill" style={{ width: (quantityDrag.index / (quantityDrag.steps.length - 1) * 100) + '%' }} />
        <span className="cargo-panel-quantity-value"><NativeBitmapText font="body" color="#e2f6ff">{amount.format(transfer.held.stack.quantity) + ' / ' + amount.format(quantityDrag.steps[quantityDrag.steps.length - 1])}</NativeBitmapText></span>
      </div>
      {cargoQuantityLabels(quantityDrag).map(label => <span className="cargo-panel-quantity-tick" key={label.value} style={{ left: label.left }}><NativeBitmapText font="body" color="#d9ecf5">{String(label.value)}</NativeBitmapText></span>)}
    </div>}
    {transfer.held && !quantityDrag && <div className="cargo-panel-held" ref={ghostRef} style={{ left: heldAt.x, top: heldAt.y }} aria-hidden="true"><CargoIcon key={transfer.held.stack.id} id={transfer.held.stack.id} /><span className="cargo-panel-amount">{amount.format(transfer.held.stack.quantity)}</span></div>}
    <span className="cargo-panel-sr-only" aria-live="polite">{transfer.held ? '手持 ' + nameOf(transfer.held.stack.id) + ' × ' + amount.format(transfer.held.stack.quantity) : ''}</span>
  </section>;
}
