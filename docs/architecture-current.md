# 当前架构索引

更新：2026-10-08。用于定位当前实现；历史实验与原版证据通过链接查阅。此次七项改造的交付与验证见 [实施记录](foundation-development-results-2026-10-08.md)，日常命令见 [开发指南](foundation-development-guide.md)。生涯仍为开发内容。

## 状态所有者与公开入口

| 领域 | 状态归属 | 对外入口与约束 |
| --- | --- | --- |
| 游戏与舰队存档 | `engine/game/GameSession` 持有游戏快照，`GameSaveStore` 负责存储与观察值冲突保护 | `GameState`、`CombatRequest`、`CombatOutcome`；战斗结算只应用到匹配的待结算遭遇。参见 [游戏所有权](game-architecture.md) |
| 本地战斗 | `CombatAuthority` 持有 tick/epoch 和有序引擎推进；`LocalCombatKernel` 在 Worker 内运行；`CombatSession` 协调命令、呈现和生命周期 | 配置/命令由 `runtime/local/LocalCombatContracts.ts` 提供，消息由 `LocalCombatProtocol.ts` 适配 `contracts/LocalCombatWire.ts`。UI 消费 HUD/呈现视图，不取得 Worker 内可变对象 |
| 战斗数值查询 | `StageProducer`、`StageAIProducer`、`FireInputs` 捕获/刷新阶段观测；原对象仍是可变权威与提交者 | solver 只消费 `StageReadView`、`AIStageView`、`FireReadInputs`。对象解析、写列、刷新和关闭由 `StageBridge` 持有；阶段 kind/epoch/revision 有效期不能跨越 |
| 内容包与扩展 | 宿主注册表持有实现与能力版本；`ShipPackCatalog` 原子发布冻结目录和 revision 索引；`ShipPackStore` 持久化包配置 | `ShipPack.variants` 是七个内置包的配装来源；`ShipPackCapabilities` 共用于预检、启动、目录与 Worker。旧配装工厂只是兼容转接。参见 [内容契约](content-extension-contract.md) |
| 联机战斗 | 房间指定的权威宿主持有 `CombatAuthority`；浏览器宿主为 `network/host.worker.ts`，服务端宿主由 `ServerBattleAuthority` 创建独立 `authority-worker` | `network/protocol.ts` 及现有快照/回执协议；呈现端接收投影，权威 tick 的提交不能由显示时钟决定。房间配置选择宿主，不能同时运行两份权威 |
| 生涯 | `CampaignService` 为主进程 RPC 门面；`CampaignWorker` 中的 `CampaignRepository` 持有 SQLite 事务和规则锁；native development 世界由原生 Runtime 持有 | `HttpGateway` 校验令牌/权限并发送命令；客户端 `CampaignClient` 使用 `Protocol`/`NativeProtocol`。原版规则位于 `campaign/rules`，不依赖 UI/数据库。原生开发路径需显式启用，尚非完整交付 |
| UI 与呈现 | 页面保存交互草稿；业务状态归上述领域；renderer 消费呈现状态 | `ui/core/UI.tsx` 的 Modal 管理全局键盘与焦点，页面快捷键在对话框存在时让出 Escape/Tab。参见 [UI 公共契约](ui-component-contracts.md) |

`LocalCombatWire` 与 `CombatTelemetry` 是独立公共数据入口；实际配置载荷还连接既有 control/content/deployment 类型。本轮没有将所有旧实现迁入公共契约层，也没有让整个应用进入 strict。

## 当前后端与实验边界

- 普通 `CombatView` 在初始化时启用本地 Worker；`?combat=inline` 和 Visual Lab 保留 inline 路径。`LocalWorkerHost` 的实际采样、命令回执、checkpoint 导出/导入及恢复状态核对已经验收。
- `OwnedCombatSession` 是已有显式选择的封装入口，默认派生属性使用 `reference`；`native-cache` 保持实验状态。不能把该类的存在描述为普通入口已全部迁移。
- 已有 phased world 在兼容原生 update 的世界中按原条件使用；本次收紧的数值决策域仍要求 `VITE_COMBAT_NUMERIC_DECISION_CORE=true`。本轮没有改变默认开关、更新频率、RNG 或伤害顺序。
- 既有 AI Worker 仍受场景准入、完整成本预算和串行回退约束；LAN AI Worker 明确要求 `VITE_LAN_AI_WORKERS=true`。本轮没有新增并行后端或消除所有旧查询路径。
- 原版可变回调继续经适配与保守失效处理。只读 TypeScript 接口不是恶意 JS 的运行时沙箱，也不允许异步保留裸列引用。

## 已接受与被拒绝的方向

| 状态 | 方向与依据 |
| --- | --- |
| 已接线并专项验收 | 公共协议/telemetry 单一类型来源、显式存档迁移、七包统一目录/能力准入、只读数值阶段、增量依赖门禁、按改动检查与开发回放。见本轮实施记录 |
| 已接线，性能目标未达成 | 同步 TS 数值决策域保留有序提交。此次 ABBA 完整步约 33.82 → 34.03 ms，行为/RNG 一致，未证明提速。见 [阶段验收](foundation-stage-boundaries-source-notes-2026-10-08.md) |
| 已拒绝，不重新启用 | 驻留并行方案历史测量约 34.56 → 100.52 ms；不能继续以新序列化器/缓存容器冒充完整成本改善。见 [拒绝记录](combat-resident-native-planning-results-2026-10-04.md) |
| 历史方案已撤回 | Rust 全核心派工不是当前实施方案；当前替代方向与约束见 [战斗决策域方案](combat-core-replacement-plan-2026-10-04.md) |
| 仍需另行策划 | 多人自选包分发/协商、缺失内容时的玩家流程、备份与持久性策略、新玩法及 UI 操作变化 |

## 版本与持久化维度

| 维度 | 当前入口与兼容规则 |
| --- | --- |
| 游戏存档 | `GameStateCodec`，schema 1；仅登记真实存在的当前版本，未来版本拒绝并保留原始数据 |
| native 世界 checkpoint | `NativeCheckpointMigrations`，连续 1 → 38；迁移使用 decoder 的私有身份图，保留共享引用；最终领域校验归 Runtime |
| native 身份图编码 | `CheckpointCodec` 的 `web-offline-identity-graph` schema 1/2；与世界 schema 38 分开 |
| 数据库 | `CampaignRepository` 的 SQLite `user_version` 与事务；不由文件迁移注册表提交数据库 |
| 内容包 | 包 schema 1、host ABI `ship-pack-host-1`、包版本及宿主 capability version 分别演进 |
| 本地 Worker 消息 | `LocalCombatWire` 的 protocol 16；本次外层及载荷字段未改变 |
| 战斗回放 | 保留 build/protocol/内容指纹/已确认输入/witness 检查；开发 JSON envelope version 1 仅保全特殊数值，不授予跨 build 恢复 |

迁移与包预检先完成私有副本/临时挂载，再由原存储边界提交。未知版本、缺失能力、冲突或失败不得覆盖旧数据；包依赖最低版本与启用状态必须满足。烛渊实际依赖休伯利安近防武器，已明确声明，未复制或替换其装备。

## 可执行的工程约束

`npm run architecture:check` 解析类型与运行时 import/export/require，检查共享层、公共协议、规则、宿主/UI、浏览器/Node 和数值 query/bridge 的依赖方向。运行时循环单独检查，类型循环不会被误报为运行时循环。

2026-10-08 工作区基线保留 6 组、115 条精确历史循环边，登记于 `scripts/architecture-exceptions.json`。没有按目录放行；新边或新增循环会失败。移除历史依赖后应删掉对应例外，不能重录整份基线掩盖问题。门禁检查不自动修改代码或例外。

最低入口：`typecheck:foundation` 检查独立 strict 契约及生成声明，`typecheck:combat` 检查普通入口与两类权威 Worker，`typecheck:campaign` 检查生涯开发客户端和 strict 生涯契约。按文件预览/执行相关检查的方法见开发指南；文档改动不默认运行测试。

native 全存档场景目前被 `src/campaign/data/reference-fleet-sync.json` 的占位数据阻塞，`character.constants` 缺失。迁移 helper 单测通过不表示完整 native 存档已验收。没有进行原版实机或界面截图对照，也没有提交或发布生涯内容。
