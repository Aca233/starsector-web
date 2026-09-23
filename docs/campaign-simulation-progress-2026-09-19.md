# 统一世界时间与权威模拟 — 2026-09-19

> 最新实现为 reference.cooperative **0.5.0**：新增原版来源的开放空间航行、控制/所有权分离与19项测试，累计97项。下文阶段性数字/缺口保留历史语境；最新边界以 [航行进度](campaign-travel-progress-2026-09-19.md) 和 [实现账本](campaign-implementation-progress-2026-09-19.md) 为准，生涯尚不可完整游玩。

## 当前结论

默认组合 `reference.cooperative` **0.4.0** 已有实际运行的世界时钟与 Node Worker 调度：独立舰队在同一个事务内推进后勤，时间、资源、舰船状态、回执和事件一起落盘。**这是后端垂直切片，不是可玩的生涯模式，也没有接入现有 LAN/Steam 生产入口。**

原版后勤公式继续由 `reference.fleet-stats` / `reference.logistics` 提供；时间切片、联机参战暂停和准备超时属于显式的 `cooperative.simulation` / `cooperative.encounters` 策略，不能称作原版多人规则。

## 1. 一条世界时钟，不再维护各舰队私有时钟

持久时间结构：

```js
clock: { tick: 0, ticksPerSecond: 60, gameSeconds: 0 }
```

- `tick` 为安全整数，`gameSeconds` 必须精确等于 `tick / ticksPerSecond`，不通过重复相加积累时间。
- 当前原版后勤适配采用 **60 ticks/游戏秒**；原版时间换算为 **10 游戏秒/天**。固定步长是 Web 实现策略，原版接收可变 dt，不承诺 Java float 逐位一致。
- 当前默认内部系统命令为 `world.advance({fromTick, ticks})`，每批 1–600 ticks；不接受客户端的有效属性、扣费数、下一份世界或新 CR。
- `logistics.advance-stationary` 已移除。不存在绕过全局时钟、单独给某一舰队推进后勤的生产命令。`logistics.set-repairs` 保留。
- Kernel 只允许被选中的 `simulation` provider、持有 `world-clock-writer` 能力、由内部 `system` 发起的计划写时钟。不能倒退、改变当前存档的时钟速率，或使时间字段不一致。
- 每一个 tick 的全部舰队读取同一份不可变 tick 起点快照；舰队顺序不改变已测试的计算结果。实体版本与世界 revision 是提交元数据，规则不能拿它们计算游戏机制，否则本来就会依赖事务批次。
- 准备超时与邀请过期在精确 tick 边界执行，再让规则读取该时刻世界。分数秒期限在首次到达或超过期限的 tick 生效；事件记录实际清理 tick。
- 一个事务内反复变化的实体最终只写一次、版本只加一。任一舰队遇到未支持效果，整个批次回滚，包括已经计算的其他舰队和时钟；不会跳过失败舰队继续计时。

当前循环只支持静止舰队：出现 `travelOrder` 或 `velocity` 就明确报 `UNSUPPORTED_TRAVEL`，不假装已经航行。循环当前使用 `aiMode: false`；**NPC/玩家/势力舰队的控制模型尚未接入，不能把拥有者类型直接当 AI 控制类型，也不能向此切片宣称已有 NPC 模拟。**

## 2. 参战时间：当前选择是显式可替换策略

默认设置：

```js
simulation: {
  ticksPerSecond: 60,
  encounterTimePolicy: 'pause-participants',
  preparationTimeoutGameSeconds: 30
}
```

| 状态 | 参战舰队 | 其他舰队与世界 |
| --- | --- | --- |
| preparing / running / recovery-required 且仍持有锁 | 不推进维护、维修和 CR；目前没有航行积分器 | 正常推进已支持后勤及全局时间 |
| 从未开打的准备超时 | 取消该遭遇、只释放本场锁，从该 tick 恢复后勤 | 不回滚其他活动 |
| 已开打后中断、重新准备又超时 | 回到 recovery-required，保留锁和待解决后果 | 继续推进 |
| 未开打时掉线而进入 recovery-required | 仍受原准备期限约束，不能以断线绕过超时 | 继续推进 |

锁解除后不补算被暂停的时段、不补发维修，也不补扣资源。这是明确的联机折衷，不是原版机制。**已开打的长期停滞、掉线主持者接管、实际战后结算和防恶意拖延尚未解决。**当前没有 `encounter.commit`，没有客户端随意上报奖励或新舰船状态的接口。

默认模拟消费的是纯遭遇期限服务：读取只读世界，返回现有 encounter/fleet 行更新。当前策略不支持的期限计划（例如额外写扩展状态）会明确拒绝，而不是悄悄丢弃；有这种需求的大改必须同时替换 simulation。

## 3. Worker 在线调度与生命周期

`CampaignSimulationLoop` 与 Repository 在同一个拥有数据库的 Node Worker 内运行；`CampaignService` 暴露内部 RPC：

```js
await service.startSimulation(worldId);
await service.simulationStatus(worldId);
await service.stopSimulation(worldId);
```

状态包含 `worldId / status / tick / pendingTicks / epoch / error`，其中 status 为 running、stopped、error。

- 显式开始才计时；读档、创建服务、重新打开数据库都不会自动恢复模拟，也不会扣离线补给。
- 使用 `performance.now()` 单调时钟累积在线时间，默认每 50ms 调度一次，实际推进固定 ticks。重复开始已运行世界不会重置基线。
- 超过 600 个待处理 ticks（休眠/卡顿）会以 `SIMULATION_LAG` 停止，不静默跳时间或一次性扣大量物资。显式重新开始 error 状态会重设在线时间基线，不补算积压。
- 未支持规则或数据库权限被接管同样会进入带错误码的 error 状态。
- 停止和关闭会尝试提交最后一个有完整 tick 的区间，Worker 先关闭模拟再关闭数据库。
- API 是可信内部调用，不是公网鉴权边界。未来网关只能由已认证会话派生 player 身份；计算主机/房主不能通过客户端包自行声明 system。

## 4. SQLite 权威 fencing 与兼容性

数据库 `PRAGMA user_version` 为 **2**，增加 singleton authority 表记录当前 epoch。

- 新 Repository 打开**同一个数据库文件**时记录新 epoch；旧的仍存活实例后续读写会报 `AUTHORITY_REPLACED`，旧实例也不能再返回幂等回执。
- 写事务在 `BEGIN IMMEDIATE` 内检查所有权，不允许旧实例在新实例接管后继续写入。新实例仍能返回历史请求的持久回执，即使重试包带旧客户端 epoch；新命令则要求新 epoch。
- 这是同一 SQLite 文件的持久 fencing，**不是分布式选主、租约心跳、跨数据库副本的防双主或自动故障接管**。读操作不提供跨进程线性化订阅保证。
- **数据库 schema 1 明确拒绝且保持原样，没有自动迁移。**早期测试/草案存档必须经显式迁移或另建测试库，不能覆盖原文件。
- 世界 JSON schema 仍为未发布的草案 1；规则锁已变到 0.4.0。schema 编号不等于可以打开旧规则锁：0.3.0 等旧组合仍会拒绝加载。
- 仍存整份世界 JSON，每次模拟提交均保留回执和 outbox；压缩/清理策略、大星区负载、512 实体写计划上限对大规模模拟的影响都尚待设计和测量。

## 5. 大改能力的实际验证

除原有测试专用研究扩展、船员/技能属性替换外，现在增加了以下实际测试，而不是只画接口图：

1. 属性 provider 读取世界中其他舰队资源与邀请状态：拆分批次、反转舰队迭代顺序后，资源结果完全一致。
2. 期限服务得到不可变世界且世界时钟与期限处理 tick 一致；越出该模拟策略范围的写计划全事务拒绝。
3. **替换整个 simulation，使用 10 ticks/秒和自有版本化扩展计数规则**：不注册原版后勤，不改 Kernel、Repository 或调度器，仍能推进、停止、原子保存和幂等重试。这只是测试机制，不进入默认玩法。

不能由这些测试推断任意经济/殖民大改已完成、任意规则无需改内核，或可直接加载 Java Mod。服务能力、数据 schema、内容版本和规则锁仍须满足合同。当前生产 Worker 工厂仍固定创建 reference 组合；自定义规则的可信加载/选择界面尚未实现，不接受客户端传入任意脚本。

## 6. 验证与仍未覆盖

当前运行测试 **78/78**：基础 20、遭遇 14、后勤 24、统一模拟 20。

```sh
node --test scripts/check-campaign-foundation.mjs scripts/check-campaign-encounters.mjs scripts/check-campaign-logistics.mjs scripts/check-campaign-simulation.mjs
node node_modules/typescript/bin/tsc -p tsconfig.campaign.json --pretty false
node node_modules/typescript/bin/tsc -b --pretty false
```

模拟测试包含真实 SQLite 事务注入失败回滚、两个同时存活 Repository 的 authority fencing、schema 1 原样拒绝，以及实际 Node Worker 的定时推进、停止、重开不追补离线时间。类型合同另外检查新模拟 RPC 的参数和只读状态。浏览器规则/内核及 Node Worker 的 esbuild 仅在内存构建，不覆盖 dist。

本轮严格合同与全项目 TypeScript 检查均通过，定向 oxlint 覆盖 40 个文件、0 条诊断，内存 esbuild 构建通过。

没有执行原版游戏数值对照，没有浏览器地图、生涯 UI、真实 LAN/Steam 联调、Electron/便携包运行、断电测试或大世界性能证明。`node:sqlite` 仍有 ExperimentalWarning。

下一条垂直链路：明确舰队控制模型 → 按原版来源实现航行/地形/油耗与位置 → 校验持久配装和战斗 memberId 适配 → 部署 CR/费用及真实战果一次性结算。世界生成、认证网关、地图交互、市场/外交/殖民和剧情仍是后续实质工作，不能以结构存在代替实现。
