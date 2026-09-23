import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import type { CSSProperties } from 'react';
import type { FleetLogisticsView, FleetView } from './Protocol';
import { NativeBitmapText } from '../../ui/NativeBitmapText';
import { hudInteger, hudSupplies, hudSupplyRate, hudCapacity, hudCargoQuantity } from './LogisticsHudModel.mjs';
import './LogisticsHud.css';
const images = '/game-assets/graphics/';
function Icon({ file }: { file: string }) {
  return <span className="logistics-icon" aria-hidden="true" style={{ maskImage: `url("${runtimeAssetUrl(images + file)}")` }} />;
}
const fleetIcon = (file: string) => 'ui/icons/fleettab/' + file + '.png';
function Text({ children }: { children: string }) { return <NativeBitmapText font="body" color="currentColor">{children}</NativeBitmapText>; }
function Capacity({ name, icon, value, capacity, testId, className, onClick, text }: {
  name: string; icon: string; value?: number | null; capacity?: number | null; testId?: string;
  className: string; onClick: () => void; text?: string;
}) {
  const bar = hudCapacity(value, capacity), label = text ?? bar.text;
  const style = { '--fill': (bar.fill * 100) + '%', '--excess': (bar.excess * 100) + '%' } as CSSProperties;
  return <button className={'logistics-capacity ' + className} onClick={onClick} aria-label={name + ' ' + label}
    title={name + ' ' + label + (bar.overloaded ? '（超出容量）' : '')} data-overloaded={bar.overloaded} data-known={bar.known}>
    <Icon file={icon} /><span className="logistics-meter" role="meter" aria-label={name} aria-valuemin={0}
      aria-valuemax={bar.known ? Math.max(value!, capacity!) : undefined} aria-valuenow={bar.known ? value! : undefined} aria-valuetext={label} style={style}>
      <span className="logistics-track" aria-hidden="true"><i className="logistics-fill" /><i className="logistics-excess" /></span><b data-testid={testId}><Text>{label}</Text></b>
    </span>
  </button>;
}
/** Native ordering and resources. Unknown rule outputs remain unknown, never zero. */
export function LogisticsHud({ cargo, logistics, status, description, expanded, fleet, onCargo, onFleet }: {
  cargo?: Record<string, number>; logistics?: FleetLogisticsView | null; status: string; description: string; expanded: boolean;
  fleet?: FleetView; onCargo: () => void; onFleet: () => void;
}) {
  const supplies = hudCargoQuantity(cargo, 'supplies'), crew = hudCargoQuantity(cargo, 'crew');
  const marines = hudCargoQuantity(cargo, 'marines'), fuel = hudCargoQuantity(cargo, 'fuel');
  const single = fleet?.private?.members.length === 1 ? fleet.private.members[0] : undefined;
  return <div className="campaign-logistics" aria-label="舰队后勤" data-expanded={expanded} data-cargo-preview={status}
    title={description || '— 表示权威规则尚未提供的数据'}>
    <button className="logistics-row logistics-credits" onClick={onCargo} aria-label="星币 未知" title="星币账户投影尚未接入">
      <Icon file={fleetIcon('credits_24x24')} /><b>—</b>
    </button>
    <button className="logistics-row campaign-supplies" onClick={onCargo} aria-label={'补给 ' + hudSupplies(supplies)} data-shortage={supplies === 0}>
      <Icon file={fleetIcon('supplies_24x24')} /><b data-testid="hud-supplies"><Text>{hudSupplies(supplies)}</Text></b>
      <small><Text>{hudSupplyRate(logistics?.suppliesPerDay, supplies)}</Text></small>
    </button>
    <button className="logistics-row logistics-crew" onClick={onCargo} aria-label={'船员 ' + hudInteger(crew) + ' / ' + hudInteger(logistics?.minimumCrew)} title="船员 / 舰队最低船员需求">
      <Icon file={fleetIcon('crew_24x')} /><b><span data-testid="hud-crew"><Text>{hudInteger(crew)}</Text></span><Text>{' / ' + hudInteger(logistics?.minimumCrew)}</Text></b>
    </button>
    <button className="logistics-row logistics-marines" onClick={onCargo} aria-label={'陆战队 ' + hudInteger(marines)} title="陆战队（与船员共享人员容量）">
      <Icon file={fleetIcon('marines_24x24')} /><b data-testid="hud-marines"><Text>{hudInteger(marines)}</Text></b>
    </button>
    <Capacity className="logistics-cargo" name="货舱" icon={fleetIcon('cargo_24x16')} value={logistics?.cargoSpaceUsed} capacity={logistics?.cargoCapacity} testId="hud-cargo-space" onClick={onCargo} />
    <Capacity className="logistics-personnel" name="人员" icon={fleetIcon('personnel_24x16')} value={logistics?.personnelUsed} capacity={logistics?.personnelCapacity} testId="hud-personnel" onClick={onCargo} />
    <Capacity className="logistics-fuel" name="燃料" icon={fleetIcon('fuel_24x16')} value={fuel} capacity={logistics?.fuelCapacity} testId="hud-fuel" onClick={onCargo} />
    <div className="logistics-burn" title="航速档位投影尚未接入" aria-label="航速 未知"><b>—</b><span /></div>
    <Capacity className="logistics-readiness" name="战备" icon={fleetIcon('cr24x16')} value={single?.combatReadiness} capacity={single ? 1 : undefined}
      text={single ? hudInteger(single.combatReadiness * 100, true) + '%' : '—'} onClick={onFleet} />
    <div className="logistics-row logistics-sensors" title="传感器强度投影尚未接入"><Icon file="icons/campaign/sensor_strength.png" /><Text>—</Text></div>
    <button className="logistics-row logistics-hull" onClick={onFleet} title="仅单舰船体；多舰汇总尚未接入"><Icon file={fleetIcon('hull24x')} /><Text>{single ? hudInteger(single.hullFraction * 100, true) + '%' : '—'}</Text></button>
    <div className="logistics-row logistics-repair" title="原版维修速率栏尚未接入"><Icon file={fleetIcon('repair_rate_24x24')} /><Text>—</Text></div>
    <div className="logistics-row logistics-profile" title="传感器轮廓投影尚未接入"><Icon file="icons/campaign/sensor_profile.png" /><Text>—</Text></div>
  </div>;
}
