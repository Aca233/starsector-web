import { factionIndex, matchesFaction } from './FactionModel';

export function FactionFilter({ value, onChange, memberships, label }: {
  value: string;
  onChange: (value: string) => void;
  memberships: readonly (readonly string[])[];
  label: string;
}) {
  const count = (id: string) => memberships.filter(ids => matchesFaction(id, ids)).length;
  return <label className="refit-faction-filter" title="按原版势力已知装备与舰队配置筛选；同一装备可以属于多个势力。">
    <span>势力</span>
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">全部势力（{memberships.length}）</option>
      {factionIndex.factions.map(faction => <option key={faction.id} value={faction.id}>
        {faction.name}（{count(faction.id)}）
      </option>)}
      <option value="__unassigned">未归类 / 特殊（{count("__unassigned")}）</option>
    </select>
  </label>;
}
