import { combatSkillDefinitions, type CombatSkillLoadout } from '../engine/extensions/CombatSkills';
import { Modal, Button } from '../ui/core/UI';
import './combat-skills.css';

export function CombatSkillPicker({ value, onChange, onClose }: {
  value: CombatSkillLoadout; onChange: (value: CombatSkillLoadout) => void; onClose: () => void;
}) {
  return <Modal title="舰长战斗技能" width="console" onClose={onClose} footer={<>
    <span className="native-statusline">按原版舰船/所属战机作用域 · 随方案保存和试战</span>
    <Button size="sm" disabled={!Object.keys(value).length} onClick={() => onChange({})}>清除技能</Button>
    <Button size="sm" onClick={onClose}>完成</Button>
  </>}>
    <p className="ui-caption">战斗模拟配置，不涉及角色升级、技能点或战役解锁。这里只列出已接入的战斗技能；普通/精英效果按原版实际启用组执行。</p>
    <div className="combat-skill-list">
      {combatSkillDefinitions.map(skill => <section className="combat-skill-row" key={skill.id}>
        <div className="combat-skill-heading"><strong>{skill.name}</strong>
          <select aria-label={skill.name + '等级'} value={value[skill.id] ?? 0} onChange={event => {
            const next = { ...value }, level = Number(event.target.value);
            if (level === 1 || level === 2) next[skill.id] = level; else delete next[skill.id];
            onChange(next);
          }}><option value="0">未配置</option><option value="1">普通</option><option value="2">精英</option></select>
        </div>
        <p>{skill.normal}</p><p className={value[skill.id] === 2 ? 'combat-skill-elite active' : 'combat-skill-elite'}>精英：{skill.elite}</p>
      </section>)}
    </div>
  </Modal>;
}
