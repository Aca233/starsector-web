import { createPortal } from 'react-dom';
import type { Member } from './protocol';
import { defaultCaptainProfile, validCaptainProfile } from '../studio/CaptainProfile';
import { EquipmentTooltip } from '../studio/EquipmentTooltip';
import type { EquipmentHover } from '../studio/useEquipmentHover';
import { combatSkillDefinitions } from '../engine/extensions/CombatSkills';
import { modManager } from '../engine/modding/ModManager';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import tree from '../studio/native-skill-tree.json';
import './lan-captain.css';

const definitions = new Map(combatSkillDefinitions.map(skill => [skill.id, skill]));
const nativeSkills = new Map(tree.skills.map((skill, index) => [skill.id, { ...skill, index }]));
const memberCaptainProfile = (member: Member) => validCaptainProfile(member.design?.captainProfile)
  ? member.design.captainProfile : defaultCaptainProfile;
const captainPortraitUrl = (member: Member) => runtimeAssetUrl(`/game-assets/graphics/portraits/${memberCaptainProfile(member).portrait}.png`);

export function LanCaptainPortrait({ member, hover }: { member: Member; hover: EquipmentHover }) {
  return <button type="button" className="lan-member-captain" {...hover.bind(member.id)}
    aria-label={member.name + '的角色头像，查看已点技能'}
    onClick={event => hover.show(member.id, event.currentTarget, true)}>
    <img src={captainPortraitUrl(member)} alt="" draggable={false} />
  </button>;
}

export function LanCaptainTooltip({ member, hover }: { member: Member; hover: EquipmentHover }) {
  const profile = memberCaptainProfile(member);
  const loadout = member.design ? member.design.captainSkills : modManager.getShip(member.hull)?.captainSkills;
  const skills = Object.entries(loadout ?? {}).filter(([, level]) => level === 1 || level === 2)
    .sort(([a], [b]) => (nativeSkills.get(a)?.index ?? 999) - (nativeSkills.get(b)?.index ?? 999));
  // Escape the scrolling/translated refit sidebar while retaining viewport positioning.
  return createPortal(<EquipmentTooltip hover={hover} preferSide className="lan-captain-tooltip">
    <h3>{profile.name} · {member.name}</h3>
    <p className="equipment-state">已点 {skills.length} 项技能 · 精英 {skills.filter(([, level]) => level === 2).length} 项</p>
    {skills.length ? <ul className="lan-captain-skills">{skills.map(([id, level]) => {
      const native = nativeSkills.get(id);
      return <li key={id} data-skill-id={id} data-elite={level === 2}>
        {native && <img src={runtimeAssetUrl('/game-assets/' + native.icon)} alt="" draggable={false} />}
        <span><strong>{definitions.get(id)?.name ?? native?.name ?? id}</strong><small>{level === 2 ? '精英' : '普通'}</small></span>
      </li>;
    })}</ul> : <p>尚未配置战斗技能</p>}
    <p className="equipment-state">{member.editing ? '正在改装；此处仍显示已应用的参战技能。' : '当前已应用的参战技能。'}</p>
  </EquipmentTooltip>, document.body);
}
