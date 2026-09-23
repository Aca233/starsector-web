import { useCallback, useEffect, useState, type Ref } from 'react';
import { CargoPanel, type CargoPanelControls } from './CargoPanel';
import { errorText, CampaignApiError, type MarketVisit, type MarketVisitInput, type MarketQuote, type MarketQuoteInput } from './CampaignClient';
import type { CampaignSession, FleetView } from './Protocol';
import type { OriginalMarketBasketItem } from '../rules/OriginalMarket.mjs';
import reference from '../data/reference-market.json';
const noPreview = () => {};
const noJettison = async () => false;
const noQuick = async () => 0;
const credits = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 0 });
export interface MarketPanelProps {
  session: CampaignSession; fleet?: FleetView; marketId: string; locked: boolean; receiptKey: string;
  controlsRef: Ref<CargoPanelControls>; onActivityChange: (active: boolean) => void;
  onRead: (input: MarketVisitInput, signal: AbortSignal) => Promise<MarketVisit>;
  onQuote: (input: MarketQuoteInput, signal: AbortSignal) => Promise<MarketQuote>;
  onTrade: (input: MarketQuoteInput, quote: MarketQuote) => Promise<boolean>;
}
export function MarketPanel(props: MarketPanelProps) {
  const [reload, setReload] = useState(0);
  const key = JSON.stringify([props.session.view.worldId, props.session.epoch, props.session.view.self.id, props.fleet?.id, props.marketId, props.receiptKey, reload]);
  return <MarketContents key={key} {...props} onReload={() => setReload(n => n + 1)} />;
}
function MarketContents({ session, fleet, marketId, locked, receiptKey, controlsRef, onActivityChange, onRead, onQuote, onTrade, onReload }: MarketPanelProps & { onReload: () => void }) {
  const [visit, setVisit] = useState<MarketVisit | null>(null), [readError, setReadError] = useState('');
  const [submarketId, setSubmarketId] = useState(''), [active, setActive] = useState(false);
  const [draft, setDraft] = useState<{ items: OriginalMarketBasketItem[] | null; held: boolean; stale: boolean }>({ items: [], held: false, stale: false });
  const [quotation, setQuotation] = useState<{ key: string; quote?: MarketQuote; error?: string } | null>(null);
  const { worldId } = session.view, { epoch } = session;
  const fleetId = fleet?.id;
  useEffect(() => {
    const controller = new AbortController();
    if (!fleetId) return () => controller.abort();
    onRead({ worldId, epoch, fleetId, marketId }, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.worldId !== worldId || value.epoch !== epoch || value.fleetId !== fleetId || value.marketId !== marketId) throw new Error('市场读取上下文不匹配。');
      setVisit(value); setSubmarketId(value.submarkets.find(s => s.plugin === 'open')?.id ?? value.submarkets[0]?.id ?? '');
    }).catch(error => { if (!controller.signal.aborted) setReadError(errorText(error)); });
    return () => controller.abort();
  }, [worldId, epoch, fleetId, marketId, onRead]);
  useEffect(() => () => onActivityChange(false), [onActivityChange]);
  const sub = visit?.submarkets.find(s => s.id === submarketId), account = visit?.accounts.length === 1 ? visit.accounts[0] : null;
  const outdated = !!visit && (session.view.clock.tick !== visit.asOfTick || fleet?.version !== visit.fleetVersion
    || visit.memberVersions.some(m => fleet?.private?.members.find(ship => ship.id === m.id)?.version !== m.version));
  const onDraft = useCallback((items: OriginalMarketBasketItem[] | null, held: boolean, stale: boolean) => setDraft({ items, held, stale }), []);
  const activity = useCallback((value: boolean) => { setActive(value); onActivityChange(value); }, [onActivityChange]);
  const itemsKey = JSON.stringify(draft.items);
  const queryKey = JSON.stringify([visit?.revision, submarketId, account?.id, itemsKey, draft.held, draft.stale, outdated, receiptKey]);
  useEffect(() => {
    if (!visit || !sub || !account || !draft.items?.length || draft.held || draft.stale || outdated) return;
    const controller = new AbortController();
    const input: MarketQuoteInput = { worldId, epoch, marketId, fleetId: visit.fleetId, submarketId: sub.id, accountId: account.id, items: JSON.parse(itemsKey) };
    const timer = setTimeout(() => { setQuotation({ key: queryKey }); void onQuote(input, controller.signal).then(quote => {
      if (controller.signal.aborted) return;
      const expected = new Map(visit.expected.map(row => [row.collection + ':' + row.id, row.version]));
      if (quote.worldId !== worldId || quote.epoch !== epoch || quote.marketId !== marketId || quote.fleetId !== visit.fleetId
        || quote.submarketId !== sub.id || quote.accountId !== account.id || quote.asOfTick !== visit.asOfTick
        || quote.expected.some(row => expected.get(row.collection + ':' + row.id) !== row.version)
        || JSON.stringify(quote.items.map(({ commodityId, side, quantity }) => ({ commodityId, side, quantity }))) !== itemsKey) {
        throw new CampaignApiError('VERSION_CONFLICT', false);
      }
      setQuotation({ key: queryKey, quote });
    }).catch(error => { if (!controller.signal.aborted) setQuotation({ key: queryKey, error: errorText(error) }); }); }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  // The serialized key covers every draft input; unrelated session polling must not restart a quote.
  }, [queryKey, visit, onQuote, worldId, epoch, marketId, itemsKey, sub, account, draft.items?.length, draft.held, draft.stale, outdated]);
  const quote = quotation?.key === queryKey ? quotation.quote : undefined;
  const status = outdated || draft.stale ? '舰队或市场状态已变化；请撤销转移后重新读取，不会自动改价成交。'
    : draft.items === null ? '当前转移含不支持的数量，或超过单次交易上限；请调整或撤销。'
      : quotation?.key === queryKey && quotation.error ? quotation.error
        : draft.held ? '放下手持货物后显示整单报价。' : draft.items.length && !quote ? '正在读取权威报价…'
          : quote?.unavailableReason ? errorText(new CampaignApiError(quote.unavailableReason, false)) : '';
  if (!visit) return <div className="campaign-market-loading" role="status"><p>{!fleetId ? '当前没有可指挥舰队。' : readError || '正在读取到港市场…'}</p>
    {readError && <button disabled={locked} onClick={onReload}>重新读取市场</button>}
    <p>只有真实到港、具备准入且经济数据有效时才显示交易库存。</p></div>;
  const summary = <section className="cargo-panel-transfer-summary" aria-label="市场交易汇总">
    <h2>{visit.name}</h2><p>星币：{credits(account?.balance)}</p>
    {!account && <p className="cargo-panel-warning">{visit.accounts.length ? '存在多个授权账户；账户选择尚未接入，不会自动选一个扣款。' : '没有可用于本舰队交易的授权账户。'}</p>}
    <dl><dt>买入</dt><dd>{credits(quote?.buyGross)}</dd><dt>卖出</dt><dd>{credits(quote?.sellGross)}</dd>
      <dt>关税{sub ? ' (' + Math.round(sub.tariffRate * 100) + '%)' : ''}</dt><dd>{credits(quote?.tariff)}</dd>
      <dt>交易净额</dt><dd>{credits(quote?.creditsDelta)}</dd></dl>
    <ul>{draft.items?.map(item => <li key={item.commodityId}>{item.side === 'buy' ? '买入' : '卖出'} {(reference.commodities as Record<string, { name: string }>)[item.commodityId]?.name ?? item.commodityId} × {item.quantity}</li>)}</ul>
    <p className="cargo-panel-warning" role="status">{status}</p>
    <button disabled={locked || active} onClick={onReload}>重新读取市场</button>
    <p className="cargo-panel-warning">当前接通公开市场资源交易。武器、特殊物品、跨子市场交易与完整进港菜单尚未接入；左下后勤仍显示成交前库存。</p>
  </section>;
  return <div className="campaign-market-screen">

    {sub ? <CargoPanel key={sub.id + ':' + visit.revision} fleet={fleet} locked={locked || !!sub.unavailableReason || !account}
      controlsRef={controlsRef} onActivityChange={activity} previewScope={worldId + ':' + marketId + ':' + visit.revision} receiptKey={receiptKey}
      previewDescription="" onPreviewChange={noPreview} onJettison={noJettison} onQuickTransfer={noQuick}
      exchange={{ tabs: (<div className="campaign-market-submarkets" role="tablist" aria-label="子市场">{visit.submarkets.map(s => <button key={s.id} role="tab" aria-selected={s.id === submarketId}
      disabled={locked || active || !!s.unavailableReason} title={s.unavailableReason ? errorText(new CampaignApiError(s.unavailableReason, false)) : undefined}
      onClick={() => setSubmarketId(s.id)}>{s.plugin === 'open' ? '开放市场' : '黑市'}</button>)}</div>), inventory: sub.inventory, label: sub.plugin === 'open' ? '开放市场' : '黑市', summary,
        unavailableCommodityIds: [...new Set([...Object.keys(fleet?.private?.cargo ?? {}), ...Object.keys(sub.inventory)])].filter(id => !sub.commodities.some(c => c.id === id && c.unavailableReason === null)), canConfirm: !!quote?.executable && !outdated && !draft.stale && !draft.held,
        onDraft, onConfirm: async items => {
          if (!quote?.executable || outdated || JSON.stringify(items) !== itemsKey) return false;
          return onTrade({ worldId, epoch, marketId, fleetId: visit.fleetId, submarketId: sub.id, accountId: account!.id, items }, quote);
        } }} /> : <p>没有可用子市场。</p>}
  </div>;
}
