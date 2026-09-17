# 原版来源与自定义内容审计 — 2026-09-16

## 本次修复状态（2026-09-16，接用户“解决、删除多余和没有功能的 UI”）

以下编号章节保留的是**修复前审计快照**，旧行号与旧数值不能当作当前实现。当前变更：

- **1 / 2 空雷**：删除固定 600 跳字、4 条假 EMP 电弧与空闲重复警报；从原版 minelayer2 / minelayer_mine_heavy 取 2000 HE、175 触发范围、200 核心 / 250 伤害半径、350 视觉爆炸半径、500 HP 和 96×96 heavy_mine3。实现 0.25 秒系统启动、单次部署事件、0.25 秒退出；避开舰船/小行星出生与空雷间距；到期触发引信，而非消失。伤害复用实际船体/已展开盾面的碰撞、短时持续爆炸与每实体只命中一次；能伤及友军、战机、导弹/小行星，相位目标排除。空雷纳入普通弹丸/光束拦截路径，不再是不可摧毁的装饰对象。友伤统计归给实际受击方。
  - **更正原审计解释**：delay=3 是“触发后”的三秒引信，不是出生武装延迟；windupDelay=1 是最后一秒警报。全伤核心外线性降到边缘 **50%**。出生有独立 0.5 秒淡入。
  - **仍有限制**：寻敌/转向仍是注明的 Web 适配，不是完整 MissileAI；原版抖动/粒子渲染也没有逐项完整移植。不要称为空雷整体 1:1。
- **3 通用诱饵**：删去全舰 C 键发射与敌方通用自动发射，不再向不具备该系统的舰船赠送能力；阔剑原生诱饵系统尚未移植，不能把删除通用能力说成已还原阔剑系统。
- **4 / 5 / 6 射程与挂点**：按显式舰装和武器类型计算射程，典范普通武器 2.0、PD 1.6；开火、AI 射程判定、光束、射程圈和资料面板共用计算。PD 标记只取原版 PD hint（o0OO.computeExtraRangeMult 也只检查 PD，不把 PD_ALSO 当 PD）。挂点颜色按实弹/能量/导弹等兼容类型，不再按尺寸；资料分别显示基础/当前射程。新元数据与挂点武器兼容类型已有校验。
- **7 / 8 预设与 AI**：不冒充原版装配；切换页写明自定义沙盒预设。未实现完整原版 variants、舰装/通风/电容、BasicShipAI。
- **9 CP**：按 settings.json 每 120 秒恢复一点，不以初始 5 点封顶；删除任意取消返还。原版多指令免费窗口尚未移植，现有逐单扣点仍属适配。
- **10 舰载机**：补充率下限改为原版 0.3；完整机库维修/整备时序未移植，未以改注释冒充修复。
- **11 / 12 虚构展示**：删除自定 S–D 评级、虚构舰名，纠正阔剑护盾描述；删除无系统舰船的假“相位潜航｜就绪”。
- **13 碰撞**：删除“严格对齐”不实注释，原经验系数仍需后续来源移植，未宣称数值已校正。
- **14 冲刺推进**：接入原版绝对 1 幅能/秒持续成本，纠正“1% 基础容量”误读；不是每秒 170 幅能。

### UI 实际删减

删除四个未使用面板 PlayerStatusCard / TargetStatusCard / RadioChatterLog / CarrierDeckConsole 及其导出；删除无用 Stat 组件与未引用的旧工作坊、蓝图输入、评级样式。移除蓝图编辑/导入/复制入口与普通战斗性能读数，保留 Visual Lab 调试。移除空编队计数、无联队召回、无护盾/无系统的操作提示、重复舰名、重复关闭按钮和空战果占位区。沙盒中不再重复显示“自由沙盒”按钮；舰队出击中只显示舰船资料，不显示不能执行的“驾驶该舰”；已结算舰队不显示重开且 R 不再触发。真实存档导入/导出、新建确认、舰队出击、武器组控制保留。

### 验证与边界

- TypeScript 构建、oxlint、生产打包通过；Vite 仅有既存大 chunk 提示。
- 不落盘的内存断言覆盖系统部署事件/时序/成本、引信/到期/最后一秒警报、2000/1000 核心边缘、盾面/相位/友军/战机、持续爆炸晚进入及去重、500HP 空雷真实弹丸拦截、友伤归属、CP 与射程/挂点类型校验。
- 隔离浏览器上下文检查开发页与生产页启动、舰船切换/装备射程与挂点颜色、无 C 诱饵、无假系统/召回 UI、700px 窄屏、嵌套确认/Escape、舰队出击/结算/重开保护。未改动用户浏览器存档。
- 未新增测试文件，未跑哈希/资源大小校验，未运行内容导入器，未修改原游戏目录。

## 原始审计：结论与范围

当前工程是「原版素材 + 部分原版静态数据/算法 + 自定义沙盒规则」的混合体，不能称为完整原版复刻。最严重的遗留问题主要在规则和展示适配层，而不在刚核对的 17 个武器静态字段。

分类：
- **明确冲突**：本地原版源码/数据有直接相反证据。
- **明确自定义**：代码直接实现了自定规则；不等于所有参数都错，但不能冒充原版。
- **待核实**：实现存在经验系数，尚未找到足够来源，不能武断说原版一定不是这样。
- **已确认依据**：只对下面列明的范围负责，不外推整场战斗手感一致。

本轮按“检查”保留运行逻辑与存档，未对数值进行试调。仅写审计记录；没有增加测试文件、运行导入脚本、检查资源哈希/文件大小或修改原游戏。

## 1. 空雷固定显示不存在的 600 伤害【明确冲突 / 展示造数 / 高】

[src/engine/simulation/systems/MineSystem.ts:177](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/MineSystem.ts#L177)：装甲/结构命中分支绘制 4 条电弧，再无条件调用 addFloatingDamage(..., 600, 紫色)。该数值不是实际伤害计算结果，没有对应的 600 EMP 部件伤害或统计记录。

[data/weapons/weapon_data.csv:164](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/weapons/weapon_data.csv#L164) 中 minelayer2 的 EMP 列为空；普通伤害为 2000 HE。这 4 条电弧及固定跳字不能作为原版空雷伤害的还原。应移除无依据跳字/电弧，伤害显示只订阅实际结算事件，不是仅换一个数字。

## 2. 厄运空雷核心规格是另一套数值【明确冲突 / 战斗 / 高】

[src/engine/simulation/systems/MineSystem.ts:60](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/MineSystem.ts#L60) 与 [data/weapons/minelayer2.wpn](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/weapons/minelayer2.wpn) 指向的 [data/weapons/proj/minelayer_mine_heavy.proj](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/weapons/proj/minelayer_mine_heavy.proj)：

| 项目 | 当前 Web | 原版数据 |
|---|---:|---:|
| 伤害 | 1000 HE | 2000 HE |
| 触发范围参数 | 220，另加目标半径一半 | proximity fuse range 175 |
| 爆炸伤害半径 | 380 | radius 250 / coreRadius 200 |
| 引信/警报 | 0.6 秒 | 触发后 delay 3 秒；windupDelay 为最后 1 秒 |
| 初始阶段 | armedTimer 1.2 秒 | 出生独立 0.5 秒淡入；delay 不是武装延迟 |
| 空间衰减 | 按中心距离线性减到边缘仍有 60% | 全伤核心 200 + 外圈衰减，不是当前曲线 |

**没有把所有常量都算成瞎编**：1000 基础部署距离加舰体半径，以及 5 秒存活时间，在 [starfarer_api_source/com/fs/starfarer/api/impl/combat/MineStrikeStats.java:24](C:/Program%20Files%20(x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/MineStrikeStats.java#L24) 中有依据。原版还有 findClearLocation、防重叠出生点、弹体引信与生命周期流程，Web 没有完整移植。不能只把伤害翻倍就称为修复。

系统使用时序也不符：[src/engine/simulation/ShipSystem.ts:64](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/ShipSystem.ts#L64) 自设 active 0.3 秒 / cooldown 0.5 秒；[data/shipsystems/ship_systems.csv:34](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/shipsystems/ship_systems.csv#L34) 是 charge up 0.25 / down 0.25 / cooldown 0。5 次充能、0.2 次/秒恢复、10% 基础幅能容量每次成本则有来源。

## 3. 全舰通用 C 键热诱弹【明确冲突 / 额外能力 / 高】

[src/engine/simulation/CombatEngine.ts:348](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/CombatEngine.ts#L348) 只检查死亡和冷却，不检查舰体系统或真实发射器；任何舰船都能发 3 枚热诱弹。玩家冷却 9 秒，敌方/增援 8.5 秒，另有 3.6 秒寿命、40 HP 等自设参数。敌舰遇到来袭导弹会自动使用（同文件 596–611）。[src/hooks/useCombatInput.ts:175](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/hooks/useCombatInput.ts#L175) 对 C 键直接调用。

[data/hulls/ship_data.csv](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/hulls/ship_data.csv)：攻势是 burndrive、典范是 fortressshield、厄运是 mine_strike，并没有这项额外通用能力。真正带 flarelauncher_fighter 的阔剑，却被 [src/engine/data/StarsectorDataLoader.ts:73](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/StarsectorDataLoader.ts#L73) 的三类系统映射丢成 NONE。原版对应发射器的 max uses=1、regen=0.033、cooldown=5（[data/shipsystems/ship_systems.csv:4](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/shipsystems/ship_systems.csv#L4)），不是当前通用机制。

应按真实系统/内置槽建模，而不是让每艘舰免费获得另一套防御系统。

## 4. 射程倍率与舰装脱钩【明确冲突 + 未建模舰装 / 高】

[src/engine/data/generated/loadouts.json:66](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/generated/loadouts.json#L66)：攻势 1.6，典范 1.8；[src/engine/data/BuiltInShips.ts:22](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/BuiltInShips.ts#L22) 直接塞进舰体规格；[src/engine/simulation/systems/ShipWeaponControlSystem.ts:862](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/ShipWeaponControlSystem.ts#L862) 用于非导弹射程，光束与 AI 还有各自入口。

典范原 .ship 有 advancedcore。[data/hullmods/AdvancedTargetingCore.java:34](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/hullmods/AdvancedTargetingCore.java#L34) 明确为实弹/能量 +100%，点防减去 40 个百分点，即基础条件下普通 2.0、点防 1.6，不能统一 1.8。

攻势 1.6 并非绝不可能：[data/hullmods/IntegratedTargetingUnit.java:13](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/hullmods/IntegratedTargetingUnit.java#L13) 的主力舰加成为 +60%。但当前数据没有实际安装舰装、OP、增幅器/耗散器的状态；原 onslaught_Standard 的 dedicated_targeting_core（未 S 改）为 +50%，见 [data/hullmods/DedicatedTargetingCore.java:14](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/hullmods/DedicatedTargetingCore.java#L14)。必须先明确哪个变体和舰装，不能把 1.6 当攻势船体天生属性。

## 5. 新整备 UI 的挂点颜色含义错误【明确冲突 / 本次 UI 新引入 / 中】

[src/ui/core/ShipPreview.tsx:12](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/ui/core/ShipPreview.tsx#L12)、[src/ui/core/theme.css:133](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/ui/core/theme.css#L133)：小型蓝色，中型黄色，大型绿色。**这是此次 UI 修改选定的自定义编码，不是原版规则。**

[starfarer_obf/com/fs/starfarer/renderers/M.java:50](C:/Program%20Files%20(x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/renderers/M.java#L50) 按 WeaponType 选颜色，枚举映射在同文件 384–428；原版区分实弹、能量、导弹及混合槽，尺寸另行表达。当前 loader 没保留 s.type（[src/engine/data/StarsectorDataLoader.ts:90](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/StarsectorDataLoader.ts#L90)），所以 UI 无法可靠展示槽位兼容类型。应先保留类型，再改颜色，不能再凭截图猜。

## 6. 整备“射程”展示的是基础值，不是实装值【口径混淆 / 中】

[src/ui/ModManagerModal.tsx:58](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/ui/ModManagerModal.tsx#L58) 直接显示 WeaponSpec.range。攻势 Mark IX 显示 900，但当前运行代码会乘 1.6，得到非导弹的发射射程 1440（未计其他场景变化）。900 本身有原版依据，不是造数；错误是没有标“基础射程”，与战场生效值混为一谈。应分别展示基础/生效值，并让显示和仿真使用同一个修正入口。

## 7. 默认配装、舰装与变体不是原版完整载入【明确自定义 / 战斗 / 高】

[src/engine/data/BuiltInShips.ts:13](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/BuiltInShips.ts#L13) 明确把生成船体与 curated sandbox equipment 合并。[src/engine/data/generated/loadouts.json](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/data/generated/loadouts.json) 是手工配装，不是运行时读取原 .variant。缺少真实 OP、增幅器/耗散器、舰装、S/D 改和技能修正链。

本轮直接比对两个具体原版变体（不声称它们是唯一正确配装）：
- [data/variants/onslaught/onslaught_Standard.variant](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/variants/onslaught/onslaught_Standard.variant)：原 WS018/020 为 devastator，当前为 mark9；原 WS014/015 为 heavyac，当前为 dualflak；还有许多原装备槽为空。原 50 fluxVents / 33 fluxCapacitors 没有加载。
- [data/variants/paragon/paragon_Elite.variant](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/variants/paragon/paragon_Elite.variant)：原有鱼雷、小型激光与其他武器，当前截断/替换了多处装备；原 50 fluxVents / 40 fluxCapacitors 及舰装未加载。

允许做自定义沙盒装配，但必须标明，不能拿其表现代表“原版标准攻势/典范”。本轮检查当前配装的原生槽类别，**未发现类别不兼容**；不同配装不等于非法配装。

## 8. AI 是自写启发式，不是原版 AI 移植【明确自定义 / 战斗 / 高】

[src/engine/ai/CapitalShipAI.ts:114](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/ai/CapitalShipAI.ts#L114)：攻势理想距离 550、典范 900、厄运 600；堡垒触发用幅能 >65% 等阈值。文件说明“深刻理解原版主力舰战术”不是来源证据。原 AI 在 [starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java](C:/Program%20Files%20(x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/combat/ai/BasicShipAI.java) 及其 maneuvers/targeting 模块，不能由少数阈值替代并宣称行为一致。

这些逻辑确实控制敌我自动驾驶。它们影响距离、集火、系统使用和武器体感，即使弹体规格正确，整场战斗仍可能明显不同。

## 9. 指挥点只有自定扣费/返还，没有完整原版流程【明确缺失 / 自定义 / 中】

[src/engine/simulation/systems/FleetCommandSystem.ts:78](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/FleetCommandSystem.ts#L78)：每次命令扣 1，取消返 1；上限固定 5，没有时间恢复逻辑。

[data/config/settings.json:744](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/config/settings.json#L744) 有 startingCommandPoints=5 和 baseSecondsPerCommandPoint=120。**初始 5 点有依据，不应误报成造数**；缺失的是恢复与真实指挥模式流程。取消退款规则的完整原版对应关系本轮未查实，暂不能称其已还原。

## 10. 航母补充/修理公式冒用了“官方系统”措辞【部分明确冲突 / 部分待核实 / 中】

[src/engine/simulation/systems/FighterSystem.ts:26](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/FighterSystem.ts#L26) 标“官方舰载机联队与机库甲板系统”，但同文件：
- 最低补充率 0.25（145/152）；原 [data/config/settings.json:199](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/config/settings.json#L199) 为 0.3。
- 每损一机 -0.04、空闲每秒 +0.015（152/158）。这两个值本轮没有确认到来源。
- 停靠每秒修结构 60、装填时间 3.2 秒（456/481），并非读取原 fighter wing/rearm/repair 配置。

影响边界：当前 5 个内置船体的 fighterBays 都是 0，正常三艘主力舰并没有暗中获得这些联队；问题在该系统被场景或自定义航母启用时。不可将“有代码”误报成每场普通战斗都在生效。

## 11. S/A/B/C/D 战斗评级是项目自定【明确自定义 / 展示 / 中】

[src/engine/simulation/systems/CombatStatsTracker.ts:118](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/CombatStatsTracker.ts#L118)：胜利、剩余结构 >=80%、时长 <=60 秒且自身零过载即 S；之后按 50%/25% 分 A/B，否则 C；失败 D。

[src/ui/CombatResultsModal.tsx:26](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/ui/CombatResultsModal.tsx#L26) 直接显示“评级”。这是本项目公式，不是已移植的原版评分规则。伤害统计多数读取真实事件，不应因评分自定就把全部统计说成假的。应删除无需求评分，或明确标“自定义评分”。

## 12. 舰体文案/舰名混有自编内容及直接错误【明确冲突 + 自定义 / 中】

[src/engine/i18n/locales/zh_CN.ts:79](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/i18n/locales/zh_CN.ts#L79) 称阔剑有全向护盾；英文对应条目称正面护盾，二者互相矛盾。原 [data/hulls/ship_data.csv](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/hulls/ship_data.csv) 阔剑为 NONE，当前生成船体也为 NONE。文本不是从原 descriptions.csv 生成，却在整备页作为“舰体说明”展示。

[src/engine/simulation/Ship.ts:213](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/Ship.ts#L213) 按玩家/敌人和 hullId 写死 TTS HEGEMON、TTS HARBINGER、ISS RADIANCE 等呼号；不来自存档舰名/舰队阵营或原版名称生成器。属于场景命名，不应误认为真实战役舰名。

固定“3 架在空/2 架待命”的旧本地化文本仍存在，但本轮检索未见主 HUD 使用；它们是残留而不是当前实时舰载机数量来源。通讯台词也由当前代码编写；旧 RadioChatterLog 仅保留导出，不在主 HUD 渲染。

## 13. 冲撞模型的“严格对齐”声明缺乏足够证据【待核实 / 战斗 / 高】

[src/engine/simulation/systems/ShipCollisionSystem.ts:71](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/systems/ShipCollisionSystem.ts#L71) 声称严格对齐，实际有 impactSpeed>20、法向速度消解系数 0.8、baseRamDmg=impactSpeed*8 等，注释还明确说“保留原实现”。本轮未定位到这些系数对应的原版公式。

统一护盾/装甲受伤入口、质量参与响应这些改进，不足以证明接触解算和撞伤系数一致。应撤销“严格”声明，逐项追踪原版碰撞算法；本轮不凭猜测给出替代系数。

## 14. 冲刺推进持续幅能未实现，注释误读单位【明确缺失 / 注释错误 / 低】

[src/engine/simulation/ShipSystem.ts:52](C:/Program%20Files%20(x86)/Starsector/starsector-web/src/engine/simulation/ShipSystem.ts#L52) 把 flux/second=1 写成“每秒 1% 基础容量”，同时表示该持续成本未建模。原 [data/shipsystems/ship_systems.csv:7](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/shipsystems/ship_systems.csv#L7) 填的是绝对 flux/second 列，f/s (base cap) 为空，不是 1% 基础容量。当前成本入口只处理堡垒硬幅能与激活成本。

不要按错误注释补成 170/秒。正确单位和系统状态计费应从原系统控制器核对后再接入。冲刺 +200 速度/加速度及 2/5/1/10 时序分别有 [data/shipsystems/scripts/BurnDriveStats.java](C:/Program%20Files%20(x86)/Starsector/starsector-core/data/shipsystems/scripts/BurnDriveStats.java) / CSV 依据，不能把整个系统都判成编造。

## 已确认有依据 / 不应误报的部分

1. 在内存中使用当前转换器只读原 .csv/.wpn/.proj，逐字段比较全部 **17 个生成武器**：已映射字段无差异。限制：同一转换器可能遗漏未映射字段，这不是独立原版战斗回放验证。
2. **5 个生成舰体**与重新只读转换结果的差异只有普通发动机 systemActivated 字段省略与 false；无行为意义差异。基础 HP/装甲/幅能、几何、护盾等并非随意填写。但阔剑原系统映射丢失、变体修正缺失仍成立。
3. 真实 sprite 与槽坐标有来源；错误在挂点颜色语义，不是舰体图片伪造。
4. 战斗结果的真实事件统计与自定义字母评分必须分开评价；空雷固定 600 是单独明确的伪数值。
5. 库存初始化是 0，settleCombat 不发凭空奖励、不自动修复。此领域代码属于新建 Web 游戏状态框架，不是原版存档格式，也没有宣称已接入战役经济。
6. 固定对手（非典范对典范，典范对攻势）、沙盒星云区域与小行星分布是自定义遭遇场景，不是原版战役生成。
7. Segoe UI / Microsoft YaHei 是用户明确选择，不是待“纠正”的原版偏差。

## 处理顺序建议

先处理 P1 实际玩法：通用热诱弹、空雷（含假 600）、真实舰装修正/射程；然后使 UI 颜色/参数与同一份真实状态同步；再做 AI、指挥和航母/冲撞来源核对。不要边审计边把未知项换成另一套经验值。

这是一轮有明确覆盖边界的审计，并非整套原版引擎逐行穷尽。未覆盖全部武器插件、舰装、所有声效变体、任务/战役、原版动态状态组合及配对实机录像。
