import { NativeCampaignApp } from './NativeCampaignApp';
import type { NativeDevelopmentSession } from './NativeProtocol';
import { CampaignHud } from './CampaignHud';
import { NativeButton, NativeFrame } from '../../ui/NativeChrome';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignCommand, CargoPreviewRequest, CampaignSession, CampaignView, EntityExpectation } from './Protocol';
import { readMarketVisit, readMarketQuote, type MarketVisitInput, type MarketQuoteInput, readCargoPreview, CampaignApiError, clearPending, errorText, readPending, readSession, readNativeDevelopmentSession, savePending, sendCommand } from './CampaignClient';
const ref = (collection: EntityExpectation['collection'], id: string, version: number): EntityExpectation => ({ collection, id, version });
const own = (v: CampaignView, id: string) => { const f = v.fleets.find(f => f.id === id && f.canCommand); if (!f) throw Error('舰队不再由你指挥。'); return f; };
type Intent = (view: CampaignView) => Pick<CampaignCommand, 'type' | 'payload' | 'expected'>;
export function CampaignApp() {
  const [nativeConnection, setNativeConnection] = useState<{token:string;session:NativeDevelopmentSession}|null>(null);
  const [lastMarketReceipt, setLastMarketReceipt] = useState('');
  const [lastJettison, setLastJettison] = useState<{ fleetId: string; requestId: string } | null>(null);
  const [code, setCode] = useState(''), [token, setToken] = useState(''), [session, setSession] = useState<CampaignSession | null>(null);
  const [message, setMessage] = useState(''), [network, setNetwork] = useState(''), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CampaignCommand | null>(null), pendingRef = useRef<CampaignCommand | null>(null), busyRef = useRef(false);
  const [fleetId, setFleetId] = useState('');
  const browseMarket = useCallback((input: MarketVisitInput, signal: AbortSignal) => readMarketVisit(token, input, signal), [token]);
  const quoteMarket = useCallback((input: MarketQuoteInput, signal: AbortSignal) => readMarketQuote(token, input, signal), [token]);
  const quoteCargo = useCallback((input: CargoPreviewRequest, signal: AbortSignal) => readCargoPreview(token, input, signal), [token]);
  const apply = (s: CampaignSession) => setSession(old => old && old.epoch === s.epoch && old.view.revision > s.view.revision ? old : s);
  useEffect(() => {
    if (!token) return; let alive = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await readSession(token); if (alive) { apply(next); setNetwork(''); } }
      catch (e) { if (alive) setNetwork(errorText(e)); }
      finally { if (alive) timer = setTimeout(poll, 350); }
    };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, [token]);
  const connect = async () => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setMessage('');
    try {
      const access = code.trim(); let next: CampaignSession;
      try { next = await readSession(access); }
      catch (e) {
        if (!(e instanceof CampaignApiError) || e.code !== 'WORLD_RUNTIME_MISMATCH') throw e;
        const native = await readNativeDevelopmentSession(access); setNativeConnection({token:access,session:native}); setCode(''); setMessage(''); return;
      }
      const previous = readPending(next.view.worldId, next.view.self.id);
      pendingRef.current = previous; setPending(previous); setSession(next); setFleetId(next.view.fleets.find(f => f.canCommand)?.id ?? '');
      setToken(access); setCode(''); setNetwork(''); setMessage(previous ? '发现上次未确认指令，请先重试同一请求。' : '已连接，舰队由世界服务器推进。');
    } catch (e) { setMessage(errorText(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  const remember = (command: CampaignCommand, playerId: string) => { savePending(playerId, command); pendingRef.current = command; setPending(command); };
  const forget = (worldId: string, playerId: string) => { clearPending(worldId, playerId); pendingRef.current = null; setPending(null); };
  const act = async (intent?: Intent, reviewed?: { worldId: string; epoch: string }) => {
    if (!token || !session || busyRef.current || (intent && pendingRef.current)) return false;
    busyRef.current = true; setBusy(true); setMessage('');
    const playerId = session.view.self.id;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const fresh = await readSession(token); apply(fresh);
        if (reviewed && (fresh.view.worldId !== reviewed.worldId || fresh.epoch !== reviewed.epoch)) throw new CampaignApiError('STALE_AUTHORITY', false);
        const command = pendingRef.current ? { ...pendingRef.current, epoch: fresh.epoch } : {
          ...intent!(fresh.view), worldId: fresh.view.worldId, epoch: fresh.epoch, requestId: crypto.randomUUID(),
        };
        remember(command, playerId);
        try {
          const receipt = await sendCommand(token, command); forget(command.worldId, playerId);
          setMessage('指令已确认 · revision ' + receipt.revision);
          if (command.type === 'market.trade-basket') setLastMarketReceipt(command.requestId);
          if (command.type === 'cargo.jettison' && typeof command.payload.fleetId === 'string') setLastJettison({ fleetId: command.payload.fleetId, requestId: command.requestId });
          // A failed refresh cannot turn an acknowledged transfer back into a retryable draft.
          try { apply(await readSession(token)); } catch (refreshError) { setNetwork(errorText(refreshError)); }
          return true;
        } catch (e) {
          if (!(e instanceof CampaignApiError) || e.uncertain) throw e;
          // Only an explicit non-commit conflict permits rebuilding a NEW command from fresh versions.
          forget(command.worldId, playerId);
          if (e.code === 'VERSION_CONFLICT' && intent && !reviewed && attempt < 2) continue;
          throw e;
        }
      }
    } catch (e) { setMessage(errorText(e) + (pendingRef.current ? ' 请重试同一请求，勿另发指令。' : '')); }
    finally { busyRef.current = false; setBusy(false); }
    return false;
  };
  if (nativeConnection) return <NativeCampaignApp key={nativeConnection.session.view.worldId+':'+nativeConnection.session.view.playerId} token={nativeConnection.token} initial={nativeConnection.session} onDisconnect={() => setNativeConnection(null)} />;
  if (!token || !session) return <main className="campaign-login"><NativeFrame className="campaign-login-card">
    <h1>生涯模式</h1><p>独立航行，自愿编队 · 连接同一个世界</p>
    <label>玩家访问码<input aria-label="玩家访问码" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void connect(); }} /></label>
    <NativeButton disabled={busy || !code.trim()} onClick={() => void connect()}>{busy ? '连接中…' : '连接生涯'}</NativeButton>
    <p role="status">{message}</p><small>访问码由房主单独发放，只保存在当前页面内存中。<br />开发入口：不是原版开局，经济与战斗结算尚未接入。</small>
  </NativeFrame></main>;
  const fleet = session.view.fleets.find(f => f.id === fleetId && f.canCommand);
  const locked = busy || !!pending || !fleet || fleet.encounterId !== null || !!fleet.navigation?.jumpPhase;
  return <CampaignHud onMarketRead={browseMarket} onMarketQuote={quoteMarket} marketReceipt={lastMarketReceipt}
    onMarketTrade={(input, quote) => {
      if (locked || !fleet || input.fleetId !== fleet.id || quote.worldId !== input.worldId || quote.epoch !== input.epoch) return Promise.resolve(false);
      const { worldId, epoch, ...payload } = input;
      // Submit exactly the reviewed version set; never rebuild a different-priced trade on conflict.
      return act(() => ({ type: 'market.trade-basket', payload: { ...payload, items: payload.items.map(item => ({ ...item })) }, expected: quote.expected }), { worldId, epoch });
    }} onCargoPreview={quoteCargo} jettisonReceipt={lastJettison?.fleetId === fleet?.id ? lastJettison?.requestId ?? '' : ''} session={session} fleet={fleet} locked={locked} busy={busy} pending={!!pending} message={message} network={network}
    onSelectFleet={setFleetId} onRetry={() => void act()} onDisconnect={() => { setToken(''); setSession(null); pendingRef.current = null; setPending(null); }}
    onApproach={pointId => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), port = v.ports?.find(p => p.anchorEntityId === pointId);
      const point = v.points.find(p => p.id === pointId) ?? (port ? { id: port.anchorEntityId, version: port.anchorVersion } : undefined); if (!point) throw Error('交互目标已不可用。');
      return { type: 'fleet.approach', payload: { fleetId: f.id, targetId: point.id }, expected: [ref('fleets', f.id, f.version), ref('spaceEntities', point.id, point.version)] };
    }); }}
    onCourse={destination => { if (locked || !fleet || !destination.every(Number.isFinite)) return; void act(v => {
      const f = own(v, fleet.id); return { type: 'fleet.set-course', payload: { fleetId: f.id, locationId: f.locationId, destination }, expected: [ref('fleets', f.id, f.version)] };
    }); }}
    onStop={() => { if (locked || !fleet) return; void act(v => { const f = own(v, fleet.id); return { type: 'fleet.stop', payload: { fleetId: f.id, locationId: f.locationId }, expected: [ref('fleets', f.id, f.version)] }; }); }}
    onJump={(pointId, index) => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), p = v.points.find(p => p.id === pointId), d = p?.destinations.find(d => d.index === index);
      if (!p || !d) throw Error('跳跃点已不可用。');
      return { type: 'fleet.jump', payload: { fleetId: f.id, sourceId: p.id, destinationIndex: index }, expected: [ref('fleets', f.id, f.version), ref('spaceEntities', p.id, p.version), ref('spaceEntities', d.targetId, d.targetVersion)] };
    }); }}
    onRepairs={(memberId, suspended) => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), ship = f.private?.members.find(m => m.id === memberId); if (!ship) throw Error('舰船已不在舰队中。');
      return { type: 'logistics.set-repairs', payload: { memberId: ship.id, suspended }, expected: [ref('fleets', f.id, f.version), ref('members', ship.id, ship.version)] };
    }); }}
    onMothballed={(memberId, mothballed) => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), ship = f.private?.members.find(m => m.id === memberId); if (!ship) throw Error('舰船已不在舰队中。');
      return { type: 'logistics.set-mothballed', payload: { memberId: ship.id, mothballed }, expected: [ref('fleets', f.id, f.version), ref('members', ship.id, ship.version)] };
    }); }}
    onFleetRepairs={suspended => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id);
      return { type: 'logistics.set-fleet-repairs', payload: { fleetId: f.id, suspended }, expected: [ref('fleets', f.id, f.version), ...(f.private?.members ?? []).map(m => ref('members', m.id, m.version))] };
    }); }}
    onJettison={items => { if (locked || !fleet) return Promise.resolve(false); return act(v => {
      const f = own(v, fleet.id);
      return { type: 'cargo.jettison', payload: { fleetId: f.id, items }, expected: [ref('fleets', f.id, f.version), ...(f.private?.members ?? []).map(m => ref('members', m.id, m.version))] };
    }); }}
    onCollect={podId => { if (locked || !fleet) return Promise.resolve(false); return act(v => {
      const f = own(v, fleet.id), pod = v.cargoPods.find(p => p.id === podId); if (!pod) throw Error('吊舱已被回收或不在当前空间。');
      return { type: 'cargo.collect', payload: { fleetId: f.id, podId }, expected: [ref('fleets', f.id, f.version), ref('spaceEntities', pod.id, pod.version), ...(f.private?.members ?? []).map(m => ref('members', m.id, m.version))] };
    }); }}
    onInvite={contact => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), p = v.parties.find(p => p.id === f.partyId);
      return { type: 'party.invite', payload: { fromFleetId: f.id, toFleetId: contact }, expected: [ref('fleets', f.id, f.version), ...(p ? [ref('parties', p.id, p.version)] : [])] };
    }); }}
    onLeave={() => { if (locked || !fleet) return; void act(v => {
      const f = own(v, fleet.id), p = v.parties.find(p => p.id === f.partyId); if (!p) throw Error('编队已经变化。');
      return { type: 'party.leave', payload: { fleetId: f.id }, expected: [ref('fleets', f.id, f.version), ref('parties', p.id, p.version)] };
    }); }}
    onInvitation={(id, accept) => { if (locked) return; void act(v => {
      const row = v.invitations.find(i => i.id === id); if (!row) throw Error('邀请已失效。');
      return { type: accept ? 'party.accept' : 'party.decline', payload: { invitationId: row.id }, expected: [ref('invitations', row.id, row.version), ...(accept ? [ref('fleets', row.fromFleetId, row.fromVersion)] : []), ref('fleets', row.toFleetId, row.toVersion), ...(accept && row.partyId ? [ref('parties', row.partyId, row.partyVersion!)] : [])] };
    }); }} />;
}
