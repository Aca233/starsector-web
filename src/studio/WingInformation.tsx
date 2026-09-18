import { contentRegistry } from '../engine/content/ContentRegistry';
import type { RefitWing } from './DesignModel';
import { RefitHoverTerm, type RefitHoverTermId } from './RefitHoverTerms';

export function WingInformation({ wing, current, comparing = false }: { wing: RefitWing; current?: RefitWing; comparing?: boolean }) {
  const craftStat = (value: RefitWing | undefined, key: 'maxSpeed' | 'hitpoints') => value ? contentRegistry.getShip(value.specId)?.[key] ?? '—' : '—';
  const rows: [RefitHoverTermId, string, number | string, number | string][] = [
    ['op', '装配点', current?.op ?? '—', wing.op],
    ['wingCount', '联队数量', current?.count ?? '—', wing.count],
    ['rebuild', '补充时间 (秒/架)', current?.rebuildSeconds ?? '—', wing.rebuildSeconds],
    ['wingRange', '作战半径', current?.range ?? '—', wing.range ?? '—'],
    ['hull', '单机结构', craftStat(current, 'hitpoints'), craftStat(wing, 'hitpoints')],
    ['speed', '单机航速', craftStat(current, 'maxSpeed'), craftStat(wing, 'maxSpeed')],
  ];
  return <><table><thead><tr><th>基础参数</th>{comparing && <th>当前</th>}<th>{comparing ? '预览' : '数值'}</th></tr></thead><tbody>
    {rows.map(([term, label, a, b]) => <tr key={term}><th><RefitHoverTerm term={term}>{label}</RefitHoverTerm></th>
      {comparing && <td>{a}</td>}<td data-changed={comparing && a !== b}>{b}</td></tr>)}
  </tbody></table><p className="equipment-state">基础值不含母舰插件；特殊系统、轰炸与补充机制尚非原版完整复现。</p></>;
}
