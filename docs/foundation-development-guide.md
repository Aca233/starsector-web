# 底层开发指南

当前职责与默认/实验路径见 [架构索引](architecture-current.md)，本轮结果见 [交付记录](foundation-development-results-2026-10-08.md)。以下命令在仓库根目录执行，需要项目现有 Node/npm 依赖；不要求安装新的测试工程。

## 先预览需要运行的检查

```powershell
npm run check:affected -- --file src/engine/game/GameStateCodec.ts
npm run check:affected -- --file src/engine/game/GameStateCodec.ts --run
npm run check:affected -- --file src/network/host.worker.ts --json artifacts/affected.json
npm run checks:catalog -- --json artifacts/check-catalog.json
```

`--file` 可重复，也可使用工作区内的绝对路径。默认只输出计划；加 `--run` 才依次执行。省略选择器时读取相对 HEAD 的改动与未跟踪文件，不修改 Git 状态。`--json` 保存同一计划；`--help` 查看简短用法。

支持 `foundation/combat/campaign/content/persistence/network/ui` 七个领域。`--domain network` 表示主动选择该领域所有可执行入口，范围较大；日常优先用受影响文件。显式只选某个已知检查可用 `--check <id>`，可重复；不能与文件/领域选择器混用，避免忽略参数。显式选择不代表整个领域验收通过。

目录登记了普通脚本、编译源、辅助模块和 Python 工具，列出所属领域、环境、成本与安全属性。`.mts` 等编译源由 wrapper/类型项目负责；`scripts/lib` 和导出辅助模块不单独运行；Python 工具需要人工确认解释器、依赖与参数。`--catalog` 只能查看目录，不能直接执行全部条目。

选择器沿静态导入查找受影响 harness，并保守纳入相关领域的动态 bundle/浏览器 harness，说明选择原因。涉及游戏存档时保留迁移/坏档/CAS/checkpoint 绑定检查，涉及联机时保留权威生命周期/IO/启动门禁，涉及生涯时保留契约/基础/gateway/native 存档门禁。未知配置影响扩大到各领域必要门禁；纯 Markdown/docs 改动没有默认运行检查。它不证明任意动态依赖都能精确追踪，应结合实际改动查看预览。

`release-scope` 保留在原发布工作流，可显式指定查看，自动日常选择不运行该发布门禁。生涯发布限制未放宽。检查结果若被占位来源或缺少环境阻塞，会实际返回失败，不能当作跳过后通过。

## 按开发领域使用入口

```powershell
npm run architecture:check
npm run typecheck:foundation
npm run typecheck:combat
npm run typecheck:campaign
npm run dev:combat
npm run dev:campaign
```

普通 `npm run dev` 继续使用原双入口配置。两个开发配置复用 `createAppConfig` 的插件、define 和资源策略；战斗构建检测生涯代码进入目标。专用宿主配置也使用同一 factory，避免把配置函数当对象展开而丢失基础配置。

`build:combat` 输出 `artifacts/development/combat`；`build:campaign:dev` 输出 `artifacts/development/campaign`。这些是开发目标，生涯构建不是发布许可。此次只验证配置及排除素材复制/编码的战斗代码+Worker 构建，没有创建发布包。普通 `build` 先执行 `typecheck`，其中包含当前增量架构与 foundation 门禁。

`foundation:check` 汇总独立契约、迁移安全、工具与共享 Modal 规则，适用于基础工程完整块集中验收；不要每个小改动重复运行。内容完整块使用 `node scripts/check-ship-pack-catalog.mjs`；阶段完整块使用 `node scripts/check-stage-boundaries.mjs`。后者默认验收当前场景，历史 before 快照只在明确指定 `STAGE_BOUNDARY_BASELINE` 时用于差分。

## 复现本地 Worker 回放

```powershell
npm run replay:combat -- --capture-sample --steps 6 --out artifacts/replay-sample
npm run replay:combat -- --replay artifacts/replay-sample/checkpoint.json --out artifacts/replay-restored
```

脚本启动私有 Vite 服务器和新的无头浏览器/profile，直接加载真实 Worker 相关模块；不打开产品主入口、不连接用户浏览器、不操作桌面或用户存档。采样包含 pilot 命令回执，恢复后比较 tick 与权威 witness，输出 `result.json`；采样另输出 `checkpoint.json`。

默认示例为罗西南特对休伯利安、seed 917、6 步，可通过 `--hull`、`--enemy-hull` 修改舰体，采样步数为 1–600。浏览器默认使用本机 Edge，Playwright 默认解析项目或本机 Codex runtime；其它机器使用 `--browser <可执行文件>`、`--modules <node_modules 路径>`，缺少依赖时明确失败。

开发导出使用无损 tagged envelope，保留 undefined、Infinity/NaN 和 -0，避免普通 JSON 改变内容指纹；现有直接 checkpoint 输入仍由原恢复逻辑校验。输入文件上限 64 MiB，envelope 解码有节点/深度限制，原回放日志限制继续有效。build、protocol、内容或 witness 不兼容时拒绝；代码改变后旧文件可能不再可恢复，应在对应相容代码下复现，不能关闭守卫强行恢复。

## 增加存档版本或宿主能力

真实 schema 变化时，在对应生产迁移入口登记相邻 `from → to`，提供历史样本和最终领域校验；不从未知结构推断版本或填默认舰船。`VersionedMigration` 校验连续历史、每步输出版本和未来版本，副本 adapter 必须与输入分离，提交仍走原存储边界。native 历史保留共享身份图及原生 helper，由 Runtime 注入；不要改成普通 JSON 深拷贝。

`VersionedMigration.mjs` 的 JSDoc 是类型来源，修改后运行：

```powershell
node scripts/generate-foundation-declarations.mjs
node scripts/generate-foundation-declarations.mjs --check
```

生成的 `.d.mts` 不手工维护。游戏 schema、身份图 schema、数据库、包版本和网络协议分别演进，没有统一全局版本号。

使用已实现机制增加舰船时优先修改包自身的 `ships/weapons/baselines/refit/variants`。新增底层机制先实现并注册宿主行为，通过 `DefinitionRegistry.register(definition, capabilityVersion)` 提供能力版本，再声明包的 `capabilities`（ID、最低版本、combat/campaign 范围）。包内声明只能增加要求，不能自行赋予支持；真实数据引用也会推导要求。`dependencies` 必须明确最低三段版本，启用依赖先于使用者。未知、未来、未实现能力或错误依赖不能发布目录。

安装预检挂载临时素材后必须在成功/失败均撤销；保留既有 IndexedDB revision 冲突保护和刷新激活流程。后续有玩家交互/原版玩法变化时，仍先写功能策划与 source-notes。

## 处理依赖门禁失败

门禁报告 rule、源文件、目标文件、类型/运行时种类和源行。先确认是否应移到公开数据契约、纯规则或组合入口；类型循环与运行时循环分别处理。`scripts/architecture-exceptions.json` 只登记已有具体边，不是新增循环的通行证。`--record-existing` 拒绝覆盖已存在基线，日常检查不更新它；旧依赖移除后删除对应例外。

当前增量门禁保留历史循环和未全仓 strict 的边界，后续按实际修改逐步消除。不要为通过检查引入 `any`、放宽权限/存档约束，或把未运行的 native 全存档/原版实机验收写成通过。
