# 底层改造交付记录

日期：2026-10-08。对应 [已授权路线图](foundation-development-roadmap-2026-10-08.md) 的七个工程块，实现均已落到生产入口、检查工具和文档。日常入口见 [开发指南](foundation-development-guide.md)，职责与默认/实验状态见 [当前架构索引](architecture-current.md)。原生生涯全存档验收存在下述数据阻塞，不等于完整生涯交付。

## 七项实际交付

| 工程块 | 已落实的结果 | 实际验证 |
| --- | --- | --- |
| 1. 公共契约与同源类型 | Worker config/commands 从 Kernel 独立；wire 外层与 telemetry 单一公共定义；strict 切片及迁移 JSDoc 生成声明。protocol 仍为 16 | 应用与独立契约类型检查、生成声明检查、改动文件 lint；真实 Worker 采样/命令/恢复通过 |
| 2. 依赖边界门禁 | AST 导入图分别识别类型/运行时边，检查层次方向及运行时循环；接入 `typecheck` 和日常选择 | 当前 1,188 源文件、4,483 runtime 边、1,283 type 边；115 条历史边/6 组循环精确保留，新增违例与无法解析的导入均为 0；工具负例验证新增反向边与循环会失败 |
| 3. 内容目录与能力准入 | 七包 13 套配装由包数据驱动；旧工厂转接；revision 索引原子发布；预检/启动/Worker 同用宿主能力事实；显式烛渊→休伯利安依赖 | 全部迁移前后配装逐字段一致；能力/未来版本/范围/依赖拒绝，目录失败保留，临时素材成功/失败撤销检查通过 |
| 4. 逐版本迁移 | 连续版本注册表进入 `GameStateCodec` 和 native Runtime；真实 native 历史 37 步 1→38 提取；游戏只登记已有 schema 1 | 迁移专项 6 项、游戏存档安全专项 3 项通过；原 native 全运行时受现有占位来源阻塞 |
| 5. 阶段读取/提交边界 | 纯数值 readonly 契约与对象桥接分开，实际 AI/fire/contact solver 接入，拒绝关闭/失效/错误 kind 与过期 supplement | strict 负例、生命周期与完整混编差分通过；同状态/RNG，完整步未证明提速 |
| 6. 检查选择与隔离回放 | 414 个检查/源/辅助条目，348 个可执行入口；按文件/领域预览后执行，保留相关安全门禁；真实 Worker 回放开发命令 | 工具专项 4 项通过；绝对路径选择实际预览通过，游戏 codec 改动只选 7 个必要门禁；采样与外部文件恢复均通过 |
| 7. 架构索引与开发目标/UI 约束 | 当前索引和指南；combat/campaign 开发类型与构建入口；共用 Vite factory，修复专用宿主丢失基础配置；Modal 键盘所有权门禁 | combat、campaign dev+契约、node config 类型检查通过；三目标配置和战斗代码+Worker 构建通过；共享 Modal 规则通过 |

没有改变装备数值、ID、更新频率、默认实验开关、伤害顺序、玩家流程/布局、权限、存档格式或持久性承诺。减少查询目录的重复遍历不构成帧率倍增证明。多人自选包协商、未来 schema、新玩法以及全仓语言/strict 重写不在本轮合同内。

## 行为与性能证据

数值阶段复用既有 22 主舰、20 AI 混编场景，seed 917，按相同 numeric opt-in 与 60 Hz fixedUpdate 执行 ABBA 四臂各 270 步。每 30 步的完整权威快照和两条 RNG 状态一致，每臂 20,790 次 AI 计划、197,894 次数值挂点查询、27,892 次数值 contact，generic contact 为 0。阶段采集、局部刷新和提交计入完整步；没有重排算法或减少工作频率。

预热后两组 before 均值合计约 33.82 ms，after 约 34.03 ms（约 +0.6%，热机/顺序波动明显）。这是边界收紧和行为验收，**未获得可确认的性能提升，未达到完整战斗 60 TPS 的证明**。计时不含网络/绘图发布或真实 Worker IPC。详细数据见 [阶段记录](foundation-stage-boundaries-source-notes-2026-10-08.md) 与 `artifacts/foundation-stage-boundaries-20261008/result.json`。

真实无头浏览器 Worker 测试分别采样、恢复和读取开发导出文件：protocol 16、tick 6、已确认日志 2 条，witness 相等、Worker 状态 ready。`CombatReplayCheckpoint` 在 dev 主图/Worker 图中的 build define 传递已修正；开发 JSON 保全特殊值，不放宽原 build、内容或 witness 守卫。证据为 `artifacts/foundation-replay-check/result.json`、`checkpoint.json` 和 `artifacts/foundation-replay-import/result.json`。这是真实权威路径验证，不是产品界面验收。

## 集中检查与保留的限制

- `foundation:check`、combat/campaign 开发类型、node 配置类型、相关改动 lint 和内容/阶段专项均已完成；工具目录最后分类修正后仅定向重跑工具 4 项与相关文件 lint，没有重复全套检查或性能测量。
- 目录覆盖编译源、导出 helpers、`scripts/lib` 与 6 个 Python 工具；它们不冒充独立已执行测试。机器可读证据为 `artifacts/foundation-check-catalog.json`、`artifacts/foundation-check-selection.json`。
- native 完整存档检查在导入真实 Runtime 时被 `src/campaign/data/reference-fleet-sync.json` 的现有占位内容阻塞：schemaVersion 为 0、character 为空，`OriginalNativeCharacterStats` 读取 `character.constants` 失败。未覆盖或捏造原版数据；带 helper fixture 的迁移单测不能替代该验收。补齐有效来源后仍需运行 `node scripts/check-campaign-native-save.mjs`。
- strict 覆盖本轮独立协议/telemetry/迁移和只读阶段，不覆盖全应用；115 条历史循环仍为增量例外，没有声称全部耦合已经消除。
- 构建验收使用 `publicDir:false` 的代码目标，没有编码/复制媒体或创建发布版；现有大 chunk、混合静态/动态 import 和排除媒体后保留 URL 的构建提示未被当作优化成功。
- 未运行全套测试、原版实机、Web UI 截图对照或发布构建。原版依据仅为本轮已读 API 与原有来源记录；不声称新增原版玩法/界面等价验证。

本轮成果保留为工作区改动；没有暂存、提交、推送、打包或发布生涯内容，保留其它任务及用户已有文件。
