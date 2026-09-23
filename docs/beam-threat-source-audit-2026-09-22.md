# 光束威胁粗筛：编码前审计（2026-09-22）

## 上轮及本轮证据
上轮导弹缓存试验因整体/混编收益不成立而恢复生产基线，属于改变下一步行动的有效证据，不继续重复该试验。当前 272 模块逐字匹配已冻结 before，默认 4 Workers 与所有预算不改。

本轮新增混编 CPU 采样：100 艘 Odyssey/Paragon 初始主舰、运行时 ships=300，60 步预热后 180 步，默认资格判定因 ship-limit 走串行，未强制降级。assessThreats 一个采样调用节点累计约 17240ms（自身 8232ms）；其中按光束 sourceShipId 调用 ships.find 的回调自身约 2879ms。第 60 步 502 条光束，所有 300 舰 hasNativeThreatPhaseHooks 均为 true。此次不改 Worker 的 ship-limit，而是先去掉大量必然无效的威胁查询。

## 原版 → 预期 → 差异
本机原版 0.98a-RC8：
- decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1193–1195 构造 300 世界单位分类空间索引。
- combat/E/oOOO.java:106–129 在碰撞处理前建立空间粗筛。
- combat/entities/BeamWeaponRay.java:317–319 的 getShip 直接返回 weapon.getShip，不为每艘受威胁舰反复全场查找发射者。

Web ThreatAssessment 当前对每艘受评估舰扫描全部 beams，并先 ships.find 后 segmentCircleEntry。现有 ProjectileThreatIndex/WeaponThreatEnvelope 的同步 native AI 阶段已具备不跨物理推进的生命周期，但光束未进入共享粗筛。

## 实施范围（修改前）
新增阶段内 BeamThreatIndex：一次读取光束线段 AABB，构造平衡区间层级；各舰用实时盾心及原有半径查询，返回按源数组位置排序的保守候选。保留重复光束条目和原始源顺序。每个候选仍执行原 ships.find、阵营/死亡/伤害/持续时间判定、精确 segmentCircleEntry 和原 add；不缓存命中、威胁、来源舰或任何阵营/生命结果。这样也不会因为重复 ID 或来源 ID 改变而复用错误的 source 引用。

只接入现有可审计、同步、串行 native AI 阶段，要求稳定 phaseShips；在 finally 中 close，绝不跨舰船运动、武器发射、光束推进或后续独立 AI 调用。少量光束不建索引。遇到自定义源字段/光束读取器、未知数值转换、数组替代、关闭或非有限查询回退原扫描；非有限/极端光束几何保留无界候选。资格额外检查不调用自定义读取器。世界级任意 Proxy 不被标记为已等价支持；该类不是可任意跨变更使用的持久索引。

## 验证门槛
- 冻结原 ThreatAssessment 对照：真实舰体夹具、完整输出精确相等，含 activeBeams 去重、重复源 ID/条目、多个阵营、NaN/Infinity/退化线段、边界和极端坐标。
- 直接检验所有原 segmentCircleEntry 命中的光束均保留，顺序与重数不变；关闭/数组变化/未知读取器回退。
- 完整 CombatSession 的 100 混编以及 100/200 Onslaught 固定步状态对照，纯舰队仍断言实际 4 Workers；混编保持原资格/预算。
- 真实 FPS/TPS 分开计量，控制与回执/释放检查、TypeScript、AI 回归。不用孤立函数收益替代全局收益，不降低模拟精度或实体数量。

无界面改动；未操作桌面或原版实机，原版实机补验仍待许可。

## 首轮后补充审计（修改前）
光束伤害/slotId 虽为数据属性，若其值是带 valueOf 的对象，原循环在命中后仍可能调用自定义转换并修改后续光束。候选资格必须同时验证原始标量类型，而不只检查属性描述符。盾效率及盾伤害修正表也必须保持无自定义转换，未知读取器/对象值整段回退；不缓存盾倍率数值。

## 最终结果
beam-safe 已接入默认原生同步 AI 阶段。2,732 项检查、实际引擎查询削减探针、30 个最终源码完整状态点、4 Worker 原路径、两类控制回执/销毁及双顺序 rAF 通过。百舰混编固定步约快 9–12%，真实 TPS 约快 7–11%，但真实压力 FPS 仍小于 1，整体卡顿未解决；没有改变 Worker/补步预算。完整数据和后续架构瓶颈见 beam-threat-performance-2026-09-22.md。
