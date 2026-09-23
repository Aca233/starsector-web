# 原版后勤推进实现与证据 — 2026-09-19

> 最新实现为 reference.cooperative **0.5.0**：新增原版来源的开放空间航行、控制/所有权分离与19项测试，累计97项。下文阶段性数字/缺口保留历史语境；最新边界以 [航行进度](campaign-travel-progress-2026-09-19.md) 和 [实现账本](campaign-implementation-progress-2026-09-19.md) 为准，生涯尚不可完整游玩。

## 实际进展

从“只会报价”推进到**有效属性解析 → 有界逐步模拟 → SQLite 原子扣费/写回舰体和 CR → Worker 调用**。生涯模式仍未完成；全局时钟现已接入，详见 [统一世界时间与权威模拟](campaign-simulation-progress-2026-09-19.md)；旅行、战后结算和完整原版一致性仍未完成。

### 代码边界

- `OriginalFleetStats.mjs`：本地原版船体统计、已核对后勤船插、容量、船员分配与有效 CR/维修参数；作为独立 `fleetStats` provider，可替换。
- `OriginalLogisticsQuote.mjs`：从原模块提取原有报价函数，原导出路径保持兼容。
- `OriginalRecovery.mjs`：基础 CR 恢复/下降，舰体与装甲维修；装甲保存采用 `y * cols + x` 行优先网格。
- `OriginalLogisticsStep.mjs`：固定步逐步扣补给、推进维修，并按已给定运动上下文计算燃料。输入/结果与原世界分离，无写数据库副作用。
- `OriginalLogistics.mjs`：组合上述服务，提供纯函数 `advance` 与玩家 `logistics.set-repairs` 命令。早期内部 `logistics.advance-stationary` 已移除，持久推进只能通过 `world.advance`。
- `reference.cooperative` 在后勤阶段升至 **0.3.0**，接入统一时钟后为 **0.4.0**。新增原版船体内置船插/模块标记、维修设置、航行换算和商品占仓数据；导入记录原始文件 SHA-256，不修改原版文件。

## 原版源码核对

本轮追加阅读：

- `campaign/fleet/RepairTracker.java`：`advanceCRAndRepairs`、`getRepairRatePerDay`、`performRepairsFraction`。
- `campaign/fleet/FleetMemberStatus.java`：`repairFraction`、`repairArmorUsingCapacity`。
- `campaign/fleet/FleetData.java`：`recrewFleetMembersV2`。
- `campaign/fleet/FleetMember.java`：封存属性修正、最低/最高船员和容量整数化、船员不足对恢复速度的影响。
- `combat/entities/ship/o0OO.java`：基础维修率与 CR 恢复率的初始化分别来自哪里。
- `api/impl/combat/CRPluginImpl.java`：0.7 基础最大 CR、缺员时 `-0.5*(1-crewFraction)`。
- `LogisticsModule.advance`：先扣补给/判定该步是否有补给，再推进维修，最后计算燃料。
- `MutableFleetStats.java` 与 `Misc.getSpeedForBurnLevel`：普通空间燃料倍率默认 0、超空间默认 1，航速换算。

已核对船插：高效检修、货舱扩容、辅助燃料罐、船员宿舍扩容、军事化子系统，以及对本后勤统计域无直接修改的民用级船体、重弹集成、弹道测距仪。后者“后勤无直接修改”不表示忽略它们的传感器、OP 或战斗效果；那些领域由对应系统负责。

## 必须保留的原版细节

1. 有效每月维护补给 / 30；维修/CR 恢复费另加。暂停维修不是免维护。
2. 每一步开始时只要有正补给，即使不足支付整个时间步，该步仍可恢复；后一步才进入缺补给下降。没有按补给余额比例发明恢复速率。
3. 缺补给 CR 下降 = 基础恢复百分比 × 0.01 × 0.5；不随高效检修的恢复加成一起提高。
4. 已高于最大 CR 的船逐步下降到上限，不因为正常恢复逻辑立刻免费调整；AI 核心舰长的源码分支另有立即限制（纯函数覆盖，真实军官接入未完成）。
5. 船员按舰队顺序分配：先按总最低需求算比例，再逐舰四舍五入且不超过剩余人数。不是每艘都获得相同的小数船员。
6. 缺员降低最大 CR、恢复和维修速度；持久字段 `combatReadiness` 明确表示 **base CR**，将来战斗适配还须应用实际船员 CR。
7. 舰体和装甲同时维修。装甲按 y 降序、x 升序使用容量，不是所有格子平均加；最后一格刚好用完容量时，满装甲网格要到下一次检查才归为 null。
8. 维修不自动补满弹药；当前弹药记录保持不变。
9. 封存取消容量/最低船员和维护，但不取消燃料消耗。容量消失导致的超载费仍按原版报价计算。
10. 民用舰多个非 S-mod 扩容带来的 50% 维护惩罚先相加，再与高效检修等倍率相乘。S-mod 扩容翻倍且没有这项维护惩罚；军事化去除该民用惩罚，非 S-mod 军事化提高最低船员需求。
11. 燃料按真实速度×时间换算距离，普通/超空间倍率互斥，再乘隐藏倍率；计费速度上限为 burn 20 对应速度，不因任意高速度无限提高消耗。

## 权威与大改接口

- 当前内部世界推进命令只接 `fromTick/ticks`，不接受客户端传维护费、有效属性或新 CR。
- 新状态、全部活动舰队补给扣除、逐舰 CR/舰体变化、世界 tick、事件与回执一起提交。相同 requestId 重试不重复扣费；新 requestId 重放旧 fromTick 拒绝。
- 世界命令验证起始 tick，按最新权威状态规划并验证行版本；锁定的参战舰队按显式联机策略跳过后勤，其他舰队继续。
- 暂停/恢复维修有个人或势力指挥权限检查，且战中不能修改。
- 所有未知舰船效果、货物占仓、技能/军官/模块/联队等，在原版属性 provider 的当前覆盖范围外会明确拒绝，不悄悄套裸船数值。
- 属性支持判断在属性 provider 内，不把“目前未移植技能”永久写死在事务命令。已用测试专用 provider 实际替换维护/技能计算，并通过同一推进命令完成扣费，未改 Kernel/Repository。

## 当前尚未完成的部分

- **当前持久命令统一推进世界时钟和静止、未锁定的舰队**，已移除每舰队游标路径。只支持已移植的后勤效果，不是完整世界模拟；NPC 控制方式、导航和地形等尚未接入。
- 60 ticks/游戏秒是显式的 Web 权威调度策略；原版接受可变 dt。批次分割在相同步数下结果完全一致，不声称与原版任意帧率/Java float 逐位一致。
- 纯函数的运动燃料模型已测，但没有导航/航线/碰撞/地形/缺油漂移，也没有向地图写位置。
- 默认联机策略已明确：参战锁定期间暂停后勤、释放后不追补，局外舰队继续；这不是原版机制，真实战后结算与防拖延仍未解决。
- 有限覆盖的后勤船插，不是完整原版技能/军官/船插目录。完整配装合法性（OP、装配槽、后勤船插数量等）仍需配装验证器。
- 未提供封存/解封操作 UI；只支持读取和模拟已有封存状态。原版即时反悔封存的 CR 记录尚未接入。
- 模块和永久脱离部件、联队、战损打捞、真实军官/AI 核心、技能、恢复时事件提示历史/过期等还未完成。
- 原版商品缺失占仓参数会加入排除记录，不默认 0；特殊物品和武器货仓也未完成。
- 已有 Worker 全局模拟循环和同文件数据库 authority fencing；地图 UI、真实网络、Electron 发布验证、自动故障接管和分布式租约尚未完成。

## 验证

新增 `scripts/check-campaign-logistics.mjs` **24 项**：原版数据解析、船员舍入、封存、船插/S-mod 组合、拒绝未移植效果、CR/舰体/逐格装甲恢复、缺补给边界、暂停维修、分批一致性、燃料计费、AI 模式、真实事务写回与去重、权限/遭遇锁、实际 Worker 推进以及替换属性 provider。

加上此前基础/遭遇测试，在后勤阶段共 **58 项**；后续另加 20 项统一模拟测试，当前 **78/78 通过**。这是源码特征回归与实际 Node/SQLite/Worker 测试；**未启动原版游戏做数值对照，不等于完整原版还原证明**。

```sh
node --test scripts/check-campaign-foundation.mjs scripts/check-campaign-encounters.mjs scripts/check-campaign-logistics.mjs scripts/check-campaign-simulation.mjs
node node_modules/typescript/bin/tsc -p tsconfig.campaign.json --pretty false
node node_modules/typescript/bin/tsc -b --pretty false
```

统一世界时间已接入。下一步明确舰队控制模型、实现原版航行与位置/油耗联动，再接真实战斗损伤/CR/部署费用与战后处理，不能停在孤立后端测试。

另外修正了持久弹药槽 ID 的边界：原版槽位如 `WS 001` 带空格，不能沿用实体 ID 的无空格限制；已验证保留弹药且拒绝控制字符。
