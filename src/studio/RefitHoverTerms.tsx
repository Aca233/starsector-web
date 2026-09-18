import { useDwellHover } from './useDwellHover';
import { DwellContext } from './dwell-context';
import { useContext, type ReactNode } from 'react';
import { DwellPopover } from './DwellTooltip';

const terms = {
  deploymentPoints: { name: '部署点（DP）', text: '一艘舰船入场占用的部署额度，不是购买价格，也不是装配点（OP）。模拟部署分别核算友军和敌军，友军已部署额度包含旗舰。模块随母舰入场，不单独重复选择；战机不作为这里的独立舰船计费。', related: ['op', 'flightDeck'] },
  flightDeck: { name: '战机甲板', text: '每个可用甲板容纳一个联队，不等于战机架数。内置联队占用固定甲板且不能普通更换；每个联队的战机数量、补充速度和作战半径需要分别查看。', related: ['wingCount', 'rebuild', 'wingRange'] },
  linked: { name: '同步射击', text: '组内武器同时收到开火指令，但各自仍受冷却、弹药、幅能与可用状态限制。自动火控还会逐门检查目标与射界，因此不保证所有武器同一时刻命中。', related: ['alternating', 'cycle', 'autofire'] },
  alternating: { name: '交替射击', text: '轮流启动组内武器的射击周期，以错开火力。已经开始的充能或连发会继续；不会降低单发伤害或单次产幅。实际节奏取决于武器周期与是否具备开火条件。', related: ['linked', 'cycle', 'groupFlux'] },
  autofire: { name: '自动开火', text: '手动驾驶时，未选中且启用自动开火的武器组可由自动火控瞄准和射击；选中的组仍由你控制。AI 驾驶会接管所有武器。这是开火授权，不保证有目标时就会立即开火。', related: ['linked', 'alternating', 'range'] },
  groupFlux: { name: '组幅能', text: '组内武器的舰装后周期平均每秒产幅之和。未扣除交替、弹药回充等待、射界或未开火时间，也不包含护盾受击与维持消耗。它不是实时净产幅，不能直接当作舰船的幅能增长速度。', related: ['flux', 'dissipation', 'upkeep'] },
  shieldBasics: { name: '护盾', text: '护盾覆盖射界内的攻击会先由护盾承受，并转化为幅能负担。护盾承伤修正、每点伤害的幅能成本与维持消耗是不同指标；过载时不能继续正常防护。', related: ['shield', 'hardFlux', 'upkeep'] },
  emp: { name: 'EMP 损害', text: 'EMP 主要用于破坏武器和引擎等组件，不等同于直接结构伤害。是否能穿过护盾、命中哪些组件以及组件的防护能力，取决于攻击和舰船修正。', related: ['shieldBasics', 'hull'] },
  venting: { name: '主动排幅', text: '主动进入排幅状态以更快清除积累幅能，与正常自然耗散不同。排幅期间不能正常使用护盾或武器，需考虑敌方火力与完成排幅所需的时间。', related: ['dissipation', 'hardFlux', 'shieldBasics'] },
  overload: { name: '幅能过载', text: '幅能负担达到上限等条件可使舰船进入过载，护盾和武器暂时无法正常使用。持续时间和恢复过程受舰船、插件与特殊机制影响。', related: ['capacity', 'hardFlux', 'shieldBasics'] },
  phase: { name: '相位潜航', text: '相位装置不是常规护盾。潜航时的保护、时间流速与幅能消耗由相位机制决定，不能用护盾效率或护盾覆盖角度直接比较。', related: ['capacity', 'dissipation', 'speed'] },
  pointDefense: { name: '点防御', text: '以拦截导弹或战机为主要用途的火控和武器特性，不是一种伤害类型。拦截表现还取决于转向速度、精度、射程和弹药。', related: ['accuracy', 'turnRate', 'range'] },
  mount: { name: '安装类型与挂点', text: '武器尺寸不得大于槽位尺寸，武器类别还须与槽位兼容。炮塔可在允许射界内转动；固定挂点主要依靠舰体转向瞄准。内置武器不能普通卸装。', related: ['turnRate', 'op'] },
  role: { name: '战术应用', text: '装备资料对常见战术用途的描述，不是额外伤害倍率或命中保证。实际效果需要结合射程、伤害类型、开火周期与目标来判断。', related: ['damage', 'range', 'cycle'] },
  hitDamage: { name: '伤害', text: '射弹武器显示单发基础伤害；持续光束以每秒伤害显示。它不等于完整射击周期的平均 DPS，也未扣除目标装甲或护盾减伤。', related: ['dps', 'damage', 'armor'] },
  accuracy: { name: '精确度', text: '描述武器散布。角度越小通常越集中，但实际命中还受目标移动、距离、弹速和瞄准影响；精确光束也不意味着自动命中所有目标。', related: ['range', 'turnRate'] },
  turnRate: { name: '武器转向速度', text: '炮塔追踪目标时的最大转动速度，单位为度/秒，不是舰船航速或舰体转向速度。固定挂点不按普通炮塔转向参数工作。', related: ['mount', 'accuracy'] },
  ammo: { name: '弹药容量', text: '武器能储存的弹药上限，不是射速。部分武器可恢复弹药，另一些用尽后无法继续开火；容量与恢复速度是不同参数。', related: ['cycle', 'dps'] },
  sMod: { name: 'S-mod 固化', text: '外装插件固化后不再消耗 OP；普通安装不会获得固化专属效果。当前沙盒允许撤销固化，外装固化最多两项；内置插件的增强不占这两个名额。', related: ['op'] },
  cr: { name: '战备值（CR）', text: '表示舰船的作战准备程度，不是结构耐久或护盾值。改装页显示当前配置的初始战备；战斗中的峰值作战时间、战备衰减与临时修正需另行考虑。', related: ['hull', 'skill'] },
  capacitors: { name: '幅能容存器', text: '使用装配点增加幅能容量。每点投资消耗 1 OP，投资上限取决于舰体；增加容存器不会提高每秒耗散。', related: ['capacity', 'op', 'vents'] },
  vents: { name: '耗散通道', text: '使用装配点增加幅能耗散。每点投资消耗 1 OP，投资上限取决于舰体；增加耗散不会直接扩大容量。', related: ['dissipation', 'op', 'capacitors'] },
  wingCount: { name: '联队数量', text: '一个甲板配置的该型联队所包含的战机数量，不是库存或甲板数量。单机结构和单机航速属于每架战机，不能当作整个联队的数值。', related: ['hull', 'speed', 'rebuild'] },
  rebuild: { name: '战机补充时间', text: '联队损失战机后的基础补充时间，单位为秒/架，不是全联队同时恢复的时间。母舰插件、技能、战机损失与补充率会影响实际补充节奏。', related: ['wingCount', 'wingRange', 'skill'] },
  wingRange: { name: '作战半径', text: '战机相对母舰的基础作战范围，不是战机搭载武器的射程。实际可用范围还受母舰修正、作战命令和战机状态影响。', related: ['range', 'wingCount'] },
  skill: { name: '舰长技能', text: '当前 Web 沙盒把已配置技能随舰船方案保存，作用于该方案，不是全舰队统一加成。仅收录原版资料的技能不能配置，也不会产生战斗效果。', related: ['elite', 'cr'] },
  elite: { name: '精英技能', text: '普通效果与精英额外效果同时生效。左键将未配置技能设为普通，再点升为精英；右键取消。当前自由配置不消耗技能点或故事点。', related: ['skill'] },
  fitted: { name: '原始 / 舰装后数据', text: '原始数据用于查看装备基础参数；舰装后数据计入当前舰船或模块的插件与技能修正。切换只改变阅读方式，不会安装或修改装备。', related: ['range', 'dps', 'skill'] },
  capacity: { name: '幅能容量', text: '可积累的幅能总量。容量越大，接近过载前的缓冲越多；它不决定每秒耗散速度。当前值由舰体、幅能投资、插件与技能共同决定。', related: ['dissipation', 'hardFlux', 'op'] },
  dissipation: { name: '幅能耗散', text: '正常状态下每秒自然消除的幅能，不是幅能容量，也不是主动排散速率。武器开火与护盾维持会占用这份耗散余量。', related: ['hardFlux', 'flux', 'capacity'] },
  hardFlux: { name: '硬幅能', text: '护盾承受会产生硬幅能的攻击时积累。通常不能在开盾时自然耗散，部分插件和技能可改变这一规则。武器开火通常产生可在开盾时耗散的软幅能。', related: ['dissipation', 'shield', 'flux'] },
  flux: { name: '武器幅能', text: '武器开火带来的幅能负担。“每秒”按射击周期平均计算，含充能与冷却，不计弹药回充等待、射界及编组交替；它不包括护盾受击与维持消耗。', related: ['dissipation', 'cycle', 'hardFlux'] },
  efficiency: { name: '武器幅伤比', text: '武器平均产幅除以周期平均伤害，表示每点面板伤害的幅能成本，通常越低越省幅能。未计命中率、目标护盾或装甲减伤，不能单凭这个比值判断强弱。', related: ['flux', 'dps', 'damage'] },
  shotFlux: { name: '每发产幅', text: '每发射弹消耗的幅能。连发武器会按一次射击中的弹数累计；持续光束使用每秒产幅，不按单发射弹计量。', related: ['flux', 'cycle'] },
  shield: { name: '护盾效率', text: '“幅能 / 伤害”表示护盾每吸收 1 点伤害产生的幅能，通常越低越好。这与武器幅伤比、护盾维持产幅不同；实际承伤还取决于伤害类型及其他修正。', related: ['hardFlux', 'damage', 'upkeep'] },
  upkeep: { name: '护盾维持', text: '开启护盾时，即使没有受到攻击也会持续产生的幅能。受击产幅在此基础上另算；相位装置不能用这项数值直接比较。', related: ['shield', 'dissipation'] },
  arc: { name: '护盾角度', text: '护盾展开后的覆盖角度，360° 为全向覆盖。展开过程、朝向和临时系统状态会影响实战保护范围；没有常规护盾的舰船显示“—”。', related: ['shield', 'upkeep'] },
  op: { name: '装配点数（OP）', text: '武器、插件、舰载机与幅能投资共享的装配预算。换装时先返还旧武器 OP，再扣除新武器 OP；内置武器不占预算。按住 Ctrl 可保留原有的武器对比。', related: ['capacity', 'dissipation'] },
  range: { name: '武器射程', text: '“原始数据”显示武器基础射程；切到“舰装后数据”才会计入当前插件、技能和射程阈值。实战电子压制、临时系统效果不在静态面板中。', related: ['dps', 'damage'] },
  dps: { name: '周期平均伤害（DPS）', text: '按完整开火周期计算的每秒平均伤害，含连发、充能和冷却。不是瞬时峰值，也不是实战命中伤害；未计目标减伤、未命中及弹药回充等待。', related: ['cycle', 'damage', 'flux'] },
  cycle: { name: '开火周期', text: '一次射击循环中开火、充能和冷却所需的时间。爆发武器的瞬时伤害可能很高，但长冷却会拉低周期平均 DPS。', related: ['dps', 'flux'] },
  damage: { name: '伤害类型', text: '动能对护盾 200%、对装甲 50%；高爆对护盾 50%、对装甲 200%；能量两者均为 100%。破片对护盾和装甲都较弱。实际伤害仍受护盾与装甲机制影响。', related: ['shield', 'dps'] },
  speed: { name: '最高航速', text: '当前配置下的常规最高航速。零幅能加速、舰船系统与实战临时状态可能改变实际速度；固定空间站不以此值移动。', related: ['capacity', 'flux'] },
  armor: { name: '舰体装甲', text: '装甲削弱命中区域承受的伤害，装甲受损具有局部性；不是一条可直接与舰体结构相加的血量。伤害类型和单次命中伤害都会影响破甲效果。', related: ['damage', 'hull'] },
  hull: { name: '舰体结构', text: '舰船结构耐久。护盾与装甲保护不足时，攻击会造成结构损伤；结构耗尽将导致舰船失去作战能力。', related: ['armor', 'shield'] },
} as const;
export type RefitHoverTermId = keyof typeof terms;

function TermBody({ term, value }: { term: RefitHoverTermId; value?: ReactNode }) {
  const parent = useContext(DwellContext);
  return <>{value !== undefined && <p className="dwell-current">当前值 <strong>{value}</strong></p>}
    <p>{terms[term].text}</p>
    {parent && parent.depth < 2 && <div className="dwell-related" aria-label="相关术语">{terms[term].related.map(key => <RefitHoverTerm key={key} term={key}>{terms[key].name}</RefitHoverTerm>)}</div>}
  </>;
}
/** Only labels gain hover targets. Values and the native parameter layout stay intact. */
export function RefitHoverTerm({ term, children }: { term: RefitHoverTermId; children: ReactNode }) {
  const parent = useContext(DwellContext);
  const hover = useDwellHover({ ownerId: parent && (parent.depth >= 0 || parent.linked) ? parent.ownerId : undefined, depth: (parent?.depth ?? 0) + 1, enabled: !!parent?.locked && parent.depth < 2 });
  if (!parent || parent.depth >= 2) return <>{children}</>;
  return <><button type="button" className="refit-hover-term" disabled={!parent.locked}
    {...hover.bind(term)} aria-expanded={!!hover.active} onClick={event => hover.show(term, event.currentTarget, true)}>{children}</button>
    <DwellPopover hover={hover} title={terms[term].name}><TermBody term={term} /></DwellPopover></>;
}
export function RefitStatHover({ term, value, enabled, children }: { term: RefitHoverTermId; value: ReactNode; enabled: boolean; children: ReactNode }) {
  const hover = useDwellHover({ enabled });
  return <><button type="button" className="refit-stat-hover" {...hover.bind(term)} aria-expanded={!!hover.active}
    aria-label={`${terms[term].name}，悬停查看解释`} onClick={event => hover.show(term, event.currentTarget, true)}>{children}</button>
    <DwellPopover hover={hover} title={terms[term].name}><TermBody term={term} value={value} /></DwellPopover></>;
}
// Match complete, known terms only. Keep all wording and numerical values unchanged.
const termAliases: [string, RefitHoverTermId][] = [
  ['同步射击', 'linked'], ['交替射击', 'alternating'], ['自动开火', 'autofire'], ['组幅能', 'groupFlux'],
  ['幅能容存器', 'capacitors'], ['耗散通道', 'vents'], ['幅能容量', 'capacity'], ['幅能耗散', 'dissipation'],
  ['硬幅能', 'hardFlux'], ['护盾效率', 'shield'], ['护盾维持', 'upkeep'], ['护盾角度', 'arc'],
  ['武器幅伤比', 'efficiency'], ['每发产幅', 'shotFlux'], ['武器幅能', 'flux'], ['武器射程', 'range'],
  ['开火周期', 'cycle'], ['伤害类型', 'damage'], ['最高航速', 'speed'], ['舰体装甲', 'armor'], ['舰体结构', 'hull'],
  ['护盾承伤', 'shieldBasics'], ['护盾', 'shieldBasics'], ['EMP', 'emp'], ['主动排幅', 'venting'], ['排幅', 'venting'], ['过载', 'overload'], ['相位', 'phase'],
  ['点防御', 'pointDefense'], ['弹药容量', 'ammo'], ['弹药', 'ammo'], ['射程', 'range'], ['装甲', 'armor'], ['航速', 'speed'], ['耗散', 'dissipation'],
  ['S-mod', 'sMod'], ['固化', 'sMod'], ['战备值', 'cr'], ['CR', 'cr'], ['装配点数', 'op'], ['装配点', 'op'], ['OP', 'op'],
  ['联队数量', 'wingCount'], ['补充时间', 'rebuild'], ['作战半径', 'wingRange'], ['舰长技能', 'skill'], ['精英', 'elite'], ['DPS', 'dps'],
];
const aliasMap = new Map(termAliases);
const termPattern = new RegExp(`(${termAliases.map(([label]) => label).sort((a, b) => b.length - a.length).join('|')})`, 'g');
export function RefitExplanationText({ text, highlightNumbers = false }: { text: string; highlightNumbers?: boolean }) {
  return <>{text.split(termPattern).map((part, index) => {
    const term = aliasMap.get(part);
    if (term) return <RefitHoverTerm key={index} term={term}>{part}</RefitHoverTerm>;
    return <span key={index}>{highlightNumbers ? part.split(/(\d+(?:\.\d+)?%?)/g).map((value, i) => /^\d/.test(value) ? <mark key={i}>{value}</mark> : value) : part}</span>;
  })}</>;
}
