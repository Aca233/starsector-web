import type { Member } from './protocol';
import { LAN_SHIPS } from './protocol';
import { NativeButton } from '../ui/NativeChrome';
import { Modal } from '../ui/core/UI';
import { validateLanDesign } from './LanDesign';
import { combatSkillDefinitions } from "../engine/extensions/CombatSkills";
import { evaluate, data, weaponName, nativeRefit, designWingSlots, type Design } from '../studio/DesignModel';

export function LanLoadoutDetails({member,onClose}:{member:Pick<Member,"name"|"hull"|"design">;onClose:()=>void}) {
  let d: Design | null = null, result: ReturnType<typeof evaluate> | null = null, error = "";
  try {
    d=member.design ? validateLanDesign(member.design) : null;
    result=d ? evaluate(d) : null;
  } catch(e) { error=e instanceof Error?e.message:"无法读取配装"; }
  const description=error ? <p className="lan-error">{error}</p> : d&&result ? <div className="lan-help">
      <h3>{d.name}</h3><p>{data.ships[d.hullId]?.name??d.hullId} · {result.op.used}/{result.op.total} OP</p>
      <p>电容 {d.capacitors} · 耗散 {d.vents} · 战斗技能 {Object.keys(d.captainSkills??{}).length} 项</p>
      <h3>武器与分组</h3>{d.groups.filter(g=>g.weaponSlotIds.length).map(g=><p key={g.index}>第 {g.index+1} 组 · {g.mode==='LINKED'?'齐射':'交替'} · {g.isAutofire?'自动开火':'手动开火'}<br/>{g.weaponSlotIds.map(slot=>weaponName(d.weapons[slot]!)).join('、')}</p>)}
      <h3>舰船插件</h3><p>{d.hullMods.map(id=>(data.hullmods[id]?.name??id)+((d.sMods??[]).includes(id)?' [S-mod]':'')).join('、')||'无外装插件'}</p>
      <h3>舰载机</h3><p>{designWingSlots(d).map(id=>id?(nativeRefit.wings[id]?.name??id):'空甲板').join('、')||'无额外联队'}</p>
      <h3>战斗技能</h3><p>{Object.entries(d.captainSkills??{}).map(([id,level])=>(combatSkillDefinitions.find(s=>s.id===id)?.name??id)+(level===2?" · 精英":" · 普通")).join("、")||"未配置"}</p>
      <p>只读查看。真人配装由本人调整，AI 配装由房主调整；应用改装后取消全员准备。</p>
    </div> : <p>{LAN_SHIPS.find(s=>s.id===member.hull)?.name??member.hull} · 当前版本内置预设</p>;
  return <Modal title={member.name+'的参战配装'} eyebrow="只读" onClose={onClose} footer={<NativeButton onClick={onClose}>返回房间</NativeButton>}>{description}</Modal>;
}
