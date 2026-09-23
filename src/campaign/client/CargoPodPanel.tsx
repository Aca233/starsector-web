import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import type { CargoPodView, FleetView } from './Protocol';
import reference from '../data/reference-market.json';
import { NativeButton } from '../../ui/NativeChrome';
const resources: Record<string, { name: string; icon: string }> = reference.commodities;
export function CargoPodPanel({ pod, fleet, locked, navigationUnavailable, onCollect, onCourse }: {
  pod?: CargoPodView; fleet?: FleetView; locked: boolean; navigationUnavailable: boolean;
  onCollect: (id: string) => void; onCourse: (p: [number, number]) => void;
}) {
  if (!pod) return <p>吊舱已被回收或不在当前空间；未重复增加库存。</p>;
  const accessible = !!fleet && pod.accessibleToFleetIds.includes(fleet.id);
  return <div className="campaign-pod-dialog"><img className="campaign-pod-illustration" src={runtimeAssetUrl('/game-assets/graphics/illustrations/cargo_pod_drift.jpg')} alt="原版货物吊舱插图" /><h3>{pod.name}</h3>
    {accessible && pod.items ? <><dl>{Object.entries(pod.items).map(([id, amount]) => <div key={id}><dt>{resources[id]?.name ?? id}</dt><dd>{amount.toLocaleString('zh-CN', { maximumFractionDigits: 6 })}</dd></div>)}</dl><NativeButton disabled={locked} onClick={() => onCollect(pod.id)}>回收全部货物</NativeButton><p className="ui-muted">回收会真实计入本舰队库存。允许超载，超载后勤费用由世界服务器计算。</p></> : <><p>舰队尚未到达可回收范围，或当前行动已锁定。</p><NativeButton disabled={locked || navigationUnavailable} onClick={() => onCourse(pod.position)}>设置航向到吊舱</NativeButton></>}
    <p className="campaign-warning">当前开发规则：吊舱保留至被回收。原版漂移、探测与过期逻辑尚未接入。</p>
  </div>;
}
