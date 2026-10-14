# 数值阶段查询与提交边界

日期：2026-10-08。对应 `foundation-development-roadmap-2026-10-08.md` 第 5 项。状态：本块实现与集中验收完成。

## 目标与范围

把现有阶段的数值查询能力与原生对象发布、提交和失效能力分开，防止后续求解器顺手读取或修改 `Ship` / `WeaponMount`。AI、火控和弹体接触继续使用现有生产者与缓存；不新增世界副本、Proxy、Worker、玩法规则、更新频率或 UI。

本轮保持 `VITE_COMBAT_NUMERIC_DECISION_CORE === 'true'` 的现有显式启用条件。该路径不等于默认引擎已全面替换。普通路径不因本轮整理被启用实验机制。

## 最小原版对照

- 本机来源：`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/EveryFrameCombatPlugin.java:8-13` 的输入、推进、世界和 UI 绘制接口；`../decompiled/starfarer_api_source/com/fs/starfarer/api/plugins/ShipSystemStatsScript.java:8-14,24-25` 的系统状态及 apply/unapply。
- 预期：保留已有推进和系统效果生命周期、即时的有序伤害/幅能/发射提交；未知效果保守失效。原版 API 没有证明其使用本工程的数值列或只读契约。
- 当前差异：`StageView` 同时向求解器暴露数值列、可变原生对象、映射和刷新/关闭方法；AI/fire 入口对已关闭阶段的防护不一致。现有 contact 查询已有 active/valid 检查，但未验证阶段种类或行上界。
- 验证：类型入口禁止查询契约写列和取得原生对象；生命周期合同覆盖关闭、失效、错误阶段与过期 fire supplement；同种子完整引擎步核对前后状态和 RNG、采集/刷新/查询实际接线及整步成本。

只修改内部工程边界，没有可见操作流程、取消/失败 UI、联机消息或存档 schema 变更。未操作原版实机、未检查原版截图，不声称界面或全部玩法等价。

## 实施与失效规则

1. `StageProtocol` 只保留数值契约与只读查询视图；对象来源、行映射、刷新/关闭能力移到 `StageBridge`。生产者持有可写列，solver 的类型只可读，不复制底层数组。
2. AI/fire/contact 的实际求解器签名收窄为只读视图；AI 控制器的行到 Ship 解析继续位于提交桥接处。发布器与有序提交者仍持有桥接能力。
3. 在公开求解边界校验 active/valid/kind；fire 程序同时校验 supplement 的 epoch/revision/projectileCount。关闭或失效时抛出明确内部契约错误，不继续读旧数值；正常未知回调仍经现有 recapture/fallback。
4. 不重排算法，不调整默认开关，不虚构性能收益。集中做一次类型、改动文件 lint 和上述相关场景；具体失败仅定向修正。

## 验收与风险

- 数值 solver 无 `Ship` / `WeaponMount` 访问或刷新/关闭能力；类型检查可发现新引入的越界写入。
- 现有生产者仍复用同一存储；未知效果与局部刷新语义不变。
- 失效边界拒绝过期观测；实际完整场景状态与 RNG 保持，整步测量包括采集与提交。
- TypeScript 只读不是对恶意 JS 的运行时沙箱；不为逐标量访问引入代理开销。跨异步保存裸数组引用仍不在受支持合同中。
- 联机权限、并发和持久化格式未改；不暂存、提交、打包或发布。

## 实施结果

- `StageProtocol.ts` 现在只有标量、只读数值列/几何/标量 ID 映射和阶段校验；原生对象、对象映射、写列、刷新、关闭放在 `StageBridge.ts`。`StageAIData.ts` 保存单一 AI 数据定义，通过映射类型产生只读视图；`FleetTask.ts` 让这个契约不再通过任务类型反向依赖 `FleetTactics` 实现。`FireProtocol.ts` 同样独立 fire supplement 的数据定义和校验，solver 不再为读取标志/类型导入对象发布器。
- 实際 AI、火控、几何、火力预算和弹体接触求解器消费 `StageReadView` / `AIStageView` / `FireReadInputs`。AI 控制器和 `CombatAIPhase` 显式通过 `batch.bridge` 执行身份解析及生命周期操作；现有存储与捕获次数不变。
- 关闭、失效、错误阶段、失效 fire supplement 与越界 projectile row 都在相关入口拒绝。同步只读类型不构成恶意 JS 的沙箱，也不允许异步保留裸列引用。
- `scripts/check-stage-read-contracts.mts` 包含有意义的负例：不能取得 Ship、关闭租约、写数值索引/替换列/调用 fill、改 ID 映射/排除集合，或修改 AI/fire supplement。

验收记录：

1. `tsc -p tsconfig.app.json --pretty false --incremental false` 通过；Stage/AI/Fire 公共只读契约及负例以独立 `--strict` 编译通过；上述改动文件 oxlint 通过。只读负例最初 3 条未使用表达式 warning 已改成 `void` 后定向复查通过。完整差分后的最后改动仅为 fire 契约移文件与导入调整，再次完成对应类型检查，不重跑未变算法的完整场景。
2. `scripts/check-stage-boundaries.mjs` 的实际生产者生命周期合同通过：AI invalidate/recapture/close、wrong-kind，fire refresh revision 过期及重新发布，contact kind/row/close。
3. 复用 `check-combat-threat-phase.mjs` 的 22 主舰混编（烛渊、荣光女王、休伯利安）、seed 917 与 20 AI 规模，以当前默认装配生成，起始位置缩放 0.2 进入交火。修改前后均显式启用同一 numeric opt-in 和 60 Hz fixedUpdate，ABBA 四臂各 270 步，每 30 步完整 authority 快照及两条 RNG 状态完全一致。每臂实际 AI 计划 20,790 次、数值挂点 197,894 次、数值 contact 27,892 次、generic contact 0；最多 157 弹体及 58 光束，包含 1,087 次接触后局部刷新和 41 次失效。
4. 每臂前 30 步预热，余下 240 次完整 fixedUpdate 均值：before 35.89 / 31.76 ms，after 35.69 / 32.38 ms；P95 分别为 before 46.04 / 35.70、after 44.39 / 36.82 ms。两组均值合计约 +0.6%，顺序/热机波动明显；这是边界收紧验收，不是提速成功或达到 60 TPS 的证明。计时包括阶段采集/刷新/提交，不含网络/画面发布或真实 Worker IPC。

证据：`artifacts/foundation-stage-boundaries-20261008/result.json`。本地保留修改前编译快照；可用 `STAGE_BOUNDARY_BASELINE=<before.mjs>` 显式重做差分，普通入口只做当前场景与生命周期检查，不读取历史旧实现。旧 `native-projectile-fixture` 的原版 hull 当前未在改装目录中，因此只复用其资源加载器；没有放宽内容准入以使旧 fixture 运行。测试打包的 Vite `?raw` 文本导入按同一语义适配，未改游戏来源。

未运行原版实机、Web 画面对照、真实浏览器 Worker 场景、全套测试或发布构建。保持 numeric opt-in、玩家操作、发布限制与其他工作区改动。
