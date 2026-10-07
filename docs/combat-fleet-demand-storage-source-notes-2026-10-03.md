# Fleet demand pressure storage — source notes — 2026-10-03

## 原版证据 → 预期行为 → 当前差异 → 验证

原版目标0.98a-RC8。`C:/starsector-core`、`C:/decompiled`缺失，原版源码/实机待核实；不操作桌面，不碰生涯，不发布。本块是保持当前已接受Web规则的存储候选，不声称原版等价。

已读：`C:/starsector-web-master/docs/combat-root-cause-brainstorm-2026-10-03.md`、root-cost source-notes/results、`combat-read-plane-materialization-audit-2026-10-03.md`。仅独占 `C:/starsector-web-master/src/engine/ai/NumericalFleetPlanner.ts`；不改FleetTactics、host.worker、Ship、ShipCollisionSystem、ThreatAssessment/WeaponThreat*/DecisionReadPlane、nearest、audit脚本。无新helper/测试工程。

### 真实consumer轴与可证明范围

生产调用点：`CombatEngine.planFleetAI:235–242` → `FleetTactics.planFleetTacticsNumerically:79–93`。adapter按原units顺序赋row=0..n−1，产出同步scalar FleetUnit，ready/source存储只在本次solve内有效。

`NumericalFleetPlanner` baseline：
- :26–28 每solve两个Float64(n²)，demand时还有两个Uint8(n²)。
- distances :32–40 仍需actor↔target、actor↔friend cover、friend↔target，以及:125–126 target↔escort（escort未限actor）。不能简单缩actor×target，此块完全不改distance。
- pressure :42–48 的行是被评估位置at，列是贡献者u；仅被influence(:72–76)经dangerAt(:81–85)消费。demand路径的at来自:120候选/ENGAGE或AVOID指定target、:139实际autonomous actor。候选通常优先major(:69–70)，但无major可回退fighters，指定target也可非major；不能硬编码78行。
- source列来自friends actors与所有visible enemies(:67–68)；**保留enemy fighters的pressure贡献**。pressure有方向，不能三角化。
- 当前没有实际触达行U计数；最坏U=n。初始176units/78major只能提供预算，不能当当前稀疏度实测。若确实只有major作为at，行上界才是major数；此候选不依赖该假设。

### 唯一实现切片

仅demand=true且`VITE_COMBAT_FLEET_DEMAND_STORAGE!=='false'`时，把pressure Float64(n²)+ready Uint8(n²)替换为solve-local按需行directory。首次pressureAt请求某at.row才建一整行Float64(n)+Uint8(n)；保留原u.row、ready零初始化、公式求值、sum/tie/candidate/claim顺序及distance对称高低方向。

ready是独立位，不以0/NaN/Infinity检测缺失；返回后directory不保存到world或跨frame结构，不暴露任何row数组。无反射资格算法、无callback/spec缓存，未知/custom producer原有adapter/gate不改变。

Rollback：`VITE_COMBAT_FLEET_DEMAND_STORAGE=false`保持原dense pressure与既有lazy计算；`VITE_COMBAT_STAGE_KERNEL=false`保持原完整eager矩阵路线，不创建按需行。只多记录事实，不增加内部时钟。

Payload预算：旧demand四表18n²；候选9n²+9nU，另有O(n)directory和U个row对象/typed-array headers。U=n时payload不省且分配头更多，须如实撤回。U未测，不虚构ms收益、不把此前nearest或已撤回fleet modifier ABBA归此候选。

### 主代理集中门禁

不由本代理运行tsc/lint/build/test/bench。交付后由主代理复用frozen source-before baseline和既有270 strict/双RNG/AI-defence/tracker；检查demand/专用rollback/STAGE_KERNEL=false，保存当前local-vs-LAN producer/flags。仅事实覆盖有意义时再计时；保持所有数学/求和/平局/目标与fighters contributions严格一致。包括empty/manual actors、major敌方缺失与ordered nonmajor target、escort/cover、-0/NaN/Infinity适配边界，不能以单一正常窗口替代失败边界。

计划事实导出：`fleetDemandStorageWork`，plans/rowPlans/densePlans/units/pressureRows/pressureCells/pressureBufferBytes/denseEquivalentPressureBytes累计值；pressureCells与既有influenceBuilds同义，不称requests或row覆盖。pressureRows仅row-route实际分配，dense路径为0不代表不消费。

## Baseline freeze

冻结原路径：`artifacts/combat-fleet-demand-storage-20261003/source-before/src/engine/ai/NumericalFleetPlanner.ts`，保持相对路径。
原文件SHA256：`E78AE2E83B8DABC411043CDCA7EC8E3E3CBEB5E2B6129F1A7434954FF1B98711`。
冻结/候选状态另由manifest记录；本文件在生产修改前写入。

## 实现完成交接（未验收）

唯一生产修改：src/engine/ai/NumericalFleetPlanner.ts。独立helper：无。专用rollback为VITE_COMBAT_FLEET_DEMAND_STORAGE=false；STAGE_KERNEL=false维持eager原路。新增事实导出fleetDemandStorageWork，字段与上节计划一致，仅在成功返回solve时累计。

源码自查：matrixDistance函数与完整consumer/claim/sum/tie块与frozen baseline逐字一致；eager压力公式只加非空类型断言，数值表达式不变。没有运行tsc/lint/构建/场景/bench，类型和行为待主代理集中验收。

冻结baseline SHA256：E78AE2E83B8DABC411043CDCA7EC8E3E3CBEB5E2B6129F1A7434954FF1B98711
候选SHA256：59C2B45ABAB2865D6DA62F0AD1E1CBC5310C812AE84375F2039673315BED4AEB
生产写入已停止；U实际覆盖尚未知，U≈n时不强行保留。

最后源码自查仅补values/ready宽typed-array类型注解，避免新建ArrayBuffer与PressureRow默认ArrayBufferLike的推断不兼容；无运行验证。生产写入现已停止。
