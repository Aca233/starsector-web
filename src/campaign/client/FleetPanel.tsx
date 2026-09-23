import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FleetView } from './Protocol';
import { hudRoundedValue } from './LogisticsHudModel.mjs';
import { useCatalogPart } from '../../studio/NativeCatalogData';
import type { Json, RecordData } from '../../studio/NativeCatalogData';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import './FleetPanel.css';

export interface FleetPanelProps {
  fleet?: FleetView;
  fleets: FleetView[];
  locked: boolean;
  onSelectFleet: (id: string) => void;
  onRepairs: (memberId: string, suspended: boolean) => void;
  onFleetRepairs: (suspended: boolean) => void;
  onMothballed: (memberId: string, mothballed: boolean) => void;
}

type Member = NonNullable<FleetView['private']>['members'][number];
type HullPresentation = { name: string; designation: string; sprite?: string; width?: number; height?: number };
const object = (value: Json | undefined): RecordData => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value: Json | undefined): string => typeof value === 'string' ? value : '';
const positive = (value: Json | undefined): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const fleetIcon = (name: string) => runtimeAssetUrl(`graphics/ui/icons/fleettab/${name}.png`);
const officerUnavailable = '军官资料与任命尚未接入；剪影表示资料未知，不代表没有军官。';
const repairTotalUnavailable = '服务器未提供完成全部舰体维修与战备恢复所需的补给总量；不以每日消耗推算。';

function hullPresentation(record: RecordData | undefined, hullId: string): HullPresentation {
  if (!record) return { name: hullId, designation: '' };
  const spec = object(record.spec), stats = object(record.stats);
  return {
    name: text(stats.name) || text(record.name) || text(spec.hullName) || hullId,
    designation: text(stats.designation),
    // The lazy ships catalog retains the exact .ship metadata, including D-hull sprites.
    // Never substitute another ship when the requested hull or its asset is absent.
    sprite: text(spec.spriteName) || text(record.sprite) || undefined,
    width: positive(spec.width), height: positive(spec.height),
  };
}


function conditionPercent(fraction: number): number | undefined {
  return Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction * 100 : undefined;
}

function FleetIcon({ name }: { name: string }) {
  return <span className="campaign-fleet-core-icon" aria-hidden="true" style={{ maskImage: `url("${fleetIcon(name)}")` }} />;
}

function UnavailableButton({ label, reason, shortcut }: { label: string; reason: string; shortcut?: string }) {
  return <span className="campaign-fleet-core-unavailable" title={reason}>
    <button type="button" className="campaign-fleet-core-strip-button" disabled title={reason} aria-label={`${label}：${reason}`}>
      <NativeBitmapText font="body" color="currentColor">{label}</NativeBitmapText>
      {shortcut && <span className="campaign-fleet-core-shortcut" aria-hidden="true">[{shortcut}]</span>}
    </button>
  </span>;
}

function ConditionBar({ value, kind }: { value: number; kind: 'cr' | 'hull' }) {
  const percent = conditionPercent(value);
  const label = kind === 'cr' ? '战备值 CR' : '舰体完整度';
  const displayed = percent === undefined ? '—' : `${Math.round(percent)}%`;
  return <div className={`campaign-fleet-core-condition campaign-fleet-core-condition-${kind}`} title={`${label}：${displayed}`}>
    <FleetIcon name={kind === 'cr' ? 'cr24x' : 'hull24x'} />
    <div className="campaign-fleet-core-condition-value">
      <div className="campaign-fleet-core-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} aria-valuetext={percent === undefined ? '数据不可用' : displayed}>
        <span className="campaign-fleet-core-meter-fill" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <NativeBitmapText font="tiny" color="currentColor">{displayed}</NativeBitmapText>
    </div>
  </div>;
}

function HullSprite({ hull, loading }: { hull: HullPresentation; loading: boolean }) {
  const [failedPath, setFailedPath] = useState<string>();
  const available = hull.sprite && hull.sprite !== failedPath;
  // Preserve the .ship aspect ratio and physical size; only large hulls are reduced.
  // An unknown dimension uses the image's own intrinsic ratio, never a made-up hull size.
  const scale = hull.width && hull.height ? Math.min(1, 170 / hull.width, 184 / hull.height) : undefined;
  const style: CSSProperties | undefined = scale === undefined ? undefined : { width: hull.width! * scale, height: hull.height! * scale };
  return <div className="campaign-fleet-core-ship-stage">
    {available ? <img className="campaign-fleet-core-ship" src={runtimeAssetUrl(hull.sprite!)} alt={`${hull.name}${hull.designation ? ` · ${hull.designation}` : ''}`}
      style={style} draggable={false} decoding="async" onError={() => setFailedPath(hull.sprite)} />
      : <span className="campaign-fleet-core-missing-sprite">{loading ? '正在读取原版舰体…' : '舰体图像不可用'}<small>{hull.name}</small></span>}
  </div>;
}

function ShipTile({ member, hull, loading, repairLock: fleetRepairLock, onRepairs, onMothballed }: {
  member: Member; hull: HullPresentation; loading: boolean; repairLock: string | null; onRepairs: FleetPanelProps['onRepairs']; onMothballed: FleetPanelProps['onMothballed'];
}) {
  const repairLock = fleetRepairLock ?? (member.mothballed ? '封存舰船不能更改维修策略' : null);
  const repairAction = member.repairsSuspended ? '恢复维修' : '暂停维修';
  const repairTitle = `${repairAction} · ${hull.name}${repairLock ? `：${repairLock}` : '（仅此舰）'}`;
  const mothballAction = member.mothballed ? '启封' : '封存';
  const mothballTitle = fleetRepairLock ? `${mothballAction} · ${hull.name}：${fleetRepairLock}`
    : `${mothballAction} · ${hull.name}。封存的舰船无法参加战斗或维修，不提供货舱、燃料舱和载员空间。启封后通过正常后勤恢复战备。`;
  const otherActions = [
    { icon: 'more_info', label: '舰船详情', reason: `${hull.name} · ${member.hullId}；详细配装数据尚未接入。` },
    { icon: 'scuttle', label: '凿沉', reason: '凿沉事务尚未接入。' },
  ];
  return <li className="campaign-fleet-core-tile" aria-label={`${hull.name} · ${member.id}`} data-member-id={member.id}>
    <div className="campaign-fleet-core-ship-name" title={`${hull.name} · ${member.hullId} · ${member.id}`}>
      <NativeBitmapText font="body" color="currentColor">{hull.name}</NativeBitmapText>
    </div>
    {member.repairsSuspended && <span className="campaign-fleet-core-paused" role="img" aria-label="此舰维修已暂停" title="此舰维修已暂停" />}
    <HullSprite key={member.hullId} hull={hull} loading={loading} />
    <div className="campaign-fleet-core-tile-actions" aria-label={`${hull.name}的舰船操作`}>
      {otherActions.map(action => <span className="campaign-fleet-core-action-hint" key={action.icon} title={action.reason}>
        <button type="button" className="campaign-fleet-core-icon-button" disabled title={action.reason} aria-label={`${action.label}：${action.reason}`}>
          <FleetIcon name={action.icon} />
        </button>
      </span>)}
      <span className="campaign-fleet-core-action-hint" title={mothballTitle}>
        <button type="button" className="campaign-fleet-core-icon-button campaign-fleet-core-mothball-button" title={mothballTitle}
          aria-label={mothballTitle} aria-pressed={member.mothballed} disabled={!!fleetRepairLock}
          onClick={() => { if (!fleetRepairLock) onMothballed(member.id, !member.mothballed); }}>
          <FleetIcon name="mothball" />
        </button>
      </span>
      <span className="campaign-fleet-core-action-hint" title={repairTitle}>
        <button type="button" className="campaign-fleet-core-icon-button campaign-fleet-core-repair-button" title={repairTitle}
          aria-label={repairTitle} aria-pressed={member.repairsSuspended} disabled={!!repairLock}
          onClick={() => { if (!repairLock) onRepairs(member.id, !member.repairsSuspended); }}>
          <FleetIcon name="suspend_repairs" />
        </button>
      </span>
      {/* Native screenshot: info, scuttle, mothball, repairs, refit (not repairs last). */}
      <span className="campaign-fleet-core-action-hint" title="生涯改装事务尚未接入。">
        <button type="button" className="campaign-fleet-core-icon-button" disabled title="生涯改装事务尚未接入。" aria-label="改装：生涯改装事务尚未接入。">
          <FleetIcon name="refit" />
        </button>
      </span>
    </div>
    <div className="campaign-fleet-core-tile-status">
      <span className="campaign-fleet-core-officer-hint" title={officerUnavailable}>
        <button type="button" className="campaign-fleet-core-officer" disabled title={officerUnavailable} aria-label={officerUnavailable}>
          <img src={runtimeAssetUrl('graphics/portraits/portrait_generic_grayscale.png')} alt="军官资料未知" draggable={false} />
        </button>
      </span>
      <div className="campaign-fleet-core-conditions">
        <ConditionBar value={member.combatReadiness} kind="cr" />
        <ConditionBar value={member.hullFraction} kind="hull" />
      </div>
    </div>
  </li>;
}

/** Full-size core-screen content only. The parent owns the world backdrop, nav and close action. */
export function FleetPanel({ fleet, fleets, locked, onSelectFleet, onRepairs, onFleetRepairs, onMothballed }: FleetPanelProps) {
  const catalog = useCatalogPart('ships');
  const hulls = useMemo(() => new Map((catalog.data ?? []).map(record => [text(record.id) || text(object(record.spec).hullId), record])), [catalog.data]);
  const members = fleet?.private?.members;
  const logistics = fleet?.private?.logistics;
  const completion = logistics?.repairCompletion;
  const completionTitle = !completion ? repairTotalUnavailable : !completion.applicable ? '当前舰队没有可用的战备恢复率；原版此时显示“不适用”。'
    : '原版维修与战备恢复补给估计：排除暂停及封存舰，使用满员修理时间口径；不包含航行期间日常维护、船员或超载消耗。';
  const completionText = !completion ? '—' : completion.applicable ? hudRoundedValue(completion.supplyCost) : '不适用';
  const selectableFleets = fleet && !fleets.some(option => option.id === fleet.id) ? [fleet, ...fleets] : fleets;
  const repairLock = !fleet?.canCommand ? '没有此舰队的指挥权限' : fleet.encounterId ? '遭遇期间不能更改舰船状态'
    : fleet.navigation?.jumpPhase ? '跳跃期间不能更改舰船状态' : locked ? '指令暂不可用；请等待当前操作完成' : null;
  const bulkRepairLock = repairLock ?? (!members?.length ? '此舰队没有可操作的舰船' : null);
  useEffect(() => {
    if (bulkRepairLock) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')
        || (target instanceof HTMLElement && target.isContentEditable))) return;
      const key = event.key.toLowerCase();
      if (key !== 'q' && key !== 'w') return;
      event.preventDefault();
      onFleetRepairs(key === 'q');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bulkRepairLock, onFleetRepairs]);
  const emptyMessage = !fleet ? '请选择舰队。' : !fleet.private ? '此舰队未公开成员与后勤资料。'
    : members?.length === 0 ? '此舰队当前没有舰船。' : null;

  return <section className="campaign-fleet-core" aria-label={`舰队管理${fleet ? ` · ${fleet.name}` : ''}`}>
    <aside className="campaign-fleet-core-sidebar" aria-label="维修与军官">
      {(selectableFleets.length > 1 || !fleet) && <label className="campaign-fleet-core-fleet-picker">
        <span>当前舰队</span>
        <select value={fleet?.id ?? ''} onChange={event => onSelectFleet(event.target.value)} aria-label="选择舰队">
          {!fleet && <option value="" disabled>请选择舰队</option>}
          {selectableFleets.map(option => <option key={option.id} value={option.id}>{option.name}{option.canCommand ? '' : ' · 只读'}</option>)}
        </select>
      </label>}
      <dl className="campaign-fleet-core-repair-totals">
        <div title="原版每日维修口径：正在维修或恢复战备的非封存、未暂停舰船的维护与恢复补给之和；不是全舰总消耗。">
          <dt><NativeBitmapText font="body" color="currentColor">每天用于维修的补给</NativeBitmapText></dt>
          <dd><NativeBitmapText font="tiny" color="currentColor">{hudRoundedValue(logistics?.repairSuppliesPerDay)}</NativeBitmapText></dd>
        </div>
        <div title={completionTitle}>
          <dt><NativeBitmapText font="body" color="currentColor">完成维修需要的补给</NativeBitmapText></dt>
          <dd aria-label={completionTitle}><NativeBitmapText font="tiny" color="currentColor">{completionText}</NativeBitmapText></dd>
        </div>
      </dl>
      <div className="campaign-fleet-core-bulk-actions">
        {[{ label: '暂停所有维修', shortcut: 'Q', suspended: true }, { label: '恢复所有维修', shortcut: 'W', suspended: false }].map(action =>
          <button key={action.shortcut} type="button" className="campaign-fleet-core-strip-button" disabled={!!bulkRepairLock}
            title={bulkRepairLock ?? `${action.label}（整支舰队，跳过封存舰）`} aria-keyshortcuts={action.shortcut.toLowerCase()}
            onClick={() => { if (!bulkRepairLock) onFleetRepairs(action.suspended); }}>
            <NativeBitmapText font="body" color="currentColor">{action.label}</NativeBitmapText>
            <span className="campaign-fleet-core-shortcut" aria-hidden="true">[{action.shortcut}]</span>
          </button>)}
      </div>
      <div className="campaign-fleet-core-officer-summary" title={officerUnavailable}>
        <span><NativeBitmapText font="body" color="currentColor">闲置的军官</NativeBitmapText></span><span aria-label="军官数量未知">—</span>
      </div>
      <UnavailableButton label="自动分配闲置的军官" reason={officerUnavailable} />
      <div className="campaign-fleet-core-notes">
        <p>军官与专精资料尚未接入。</p>
        <p>{repairLock ?? 'Q 暂停、W 恢复全舰队维修；右下方维修图标仅操作单舰。'}</p>
        {fleet?.private?.logisticsUnavailable && <p title={fleet.private.logisticsUnavailable}>后勤数据暂不可用，不以零代替。</p>}
        {catalog.error && <p>原版舰体目录读取失败。<button type="button" className="campaign-fleet-core-retry" onClick={catalog.retry}>重试</button></p>}
      </div>
    </aside>
    <div className="campaign-fleet-core-matrix" aria-label="舰船矩阵" tabIndex={0}>
      <ul className="campaign-fleet-core-tiles" aria-label="舰船" aria-busy={!catalog.data && !catalog.error}>
        {members?.map(member => <ShipTile key={`${fleet!.id}:${member.id}`} member={member}
          hull={hullPresentation(hulls.get(member.hullId), member.hullId)} loading={!catalog.data && !catalog.error}
          repairLock={repairLock} onRepairs={onRepairs} onMothballed={onMothballed} />)}
      </ul>
      {emptyMessage && <p className="campaign-fleet-core-empty" role="status">{emptyMessage}</p>}
    </div>
  </section>;
}
