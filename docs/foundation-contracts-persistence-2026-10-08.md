# 公共契约与迁移实施记录

对应 [本轮底层改造策划](foundation-development-roadmap-2026-10-08.md) 的第 1、4 项。此次为内部数据/工程整理，不改变游戏规则、操作、界面、保存频率或回放兼容范围。

## 公共协议

`LocalCombatContracts.ts` 持有公开配置与命令，`LocalCombatProtocol.ts` 不再从具体 Kernel 的内部属性推导 telemetry 或 AI 状态。`engine/contracts/LocalCombatWire.ts` 持有所有消息外层字段、判别类型与 protocol 16，公开适配器仅代入实际领域载荷。`engine/contracts/CombatTelemetry.ts` 是碰撞、尾迹与 AI telemetry 的单一类型来源，原生产模块保留兼容 re-export，并显式声明返回类型。Worker 与 Host 保持原消息字段。

`tsconfig.foundation.json` 严格检查消息外层、telemetry 数据契约及通用迁移 JSDoc 实现。实际载荷关联的 control、deployment 和 presentation 仍连接旧类型/实现混合模块；本轮没有声称整个 Worker 依赖图已经 strict。完整消费者由普通应用 typecheck 覆盖。

## 显式版本迁移

`VersionedMigration.mjs` 注册连续的 `from → to`，拒绝重复、跳级、缺步与未来版本，迁移后核对每一步的目标版本。copy 适配器必须提供与输入分离的图；迁移基础不操作存储。JSDoc 是声明唯一来源，执行 `node scripts/generate-foundation-declarations.mjs --check` 可检查生成声明漂移。

两个生产接入：

- `GameStateCodec` 仅登记当前 schema 1，没有虚构旧版或 v2 数据。GameSaveStore 的坏档保护、观察值 CAS、显式替换和 checkpoint binding 不变。
- `NativeCheckpointMigrations` 收纳原 NativeCampaignRuntime 已有的 37 个迁移（1 → 38）。使用原 `decodeOfflineCheckpoint` 生成私有身份图，不再做第二份全世界复制；原生 helper 从 Runtime 注入。原守卫、共享引用、旧版未知字段和空历史限制保持。最终完整领域校验仍由 Runtime 执行，失败不会落盘。

文件 schema、原生身份图 schema、数据库版本、内容版本、网络协议与回放 build 继续独立。没有引入新保存格式、跨 build 回放、备份删除或持久化承诺。

## 验收状态

- `tsc -p tsconfig.foundation.json`：通过。
- `node --test scripts/check-versioned-migrations.mjs`：6 项通过；覆盖注册缺口/跳级、输入隔离、失败保原、实际历史字段、共享速度/loot/防御修正身份、禁止虚构尾迹/晋升历史与未来版本。
- `node --test scripts/check-game-save-boundary.mjs`：3 项通过；当前版本隔离副本、未来版本/坏档保护、多页面 CAS 与 checkpoint binding、配额失败及显式替换。
- 改动文件 `oxlint`：通过。
- `LocalCombatProtocol` 单独打包的运行时输入仅含协议适配器和 `LocalCombatWire`；输出仅 protocol 16，未引入 Kernel/引擎实现。此检查不能替代实际载荷类型检查。
- 真实 Worker 场景已在写集合并后通过：protocol 16、tick 6、采样/实际 pilot 回执、checkpoint 导出与新 Worker 恢复的 witness 相等；外部文件导入同样通过。开发 build define 与无损 JSON envelope 修正见 [整体交付记录](foundation-development-results-2026-10-08.md)。未放宽 build、内容或协议检查。
- native 全运行时导入受当前工作区 `reference-fleet-sync.json` 的 `character.constants` 缺失阻塞（`OriginalNativeCharacterStats.mjs:11`）。迁移单测的原生 helper fixture 不能替代原生全存档验收。
- 未进行原版实机或 Web UI 验收；此次没有视觉改动，不声称原版界面等价。
