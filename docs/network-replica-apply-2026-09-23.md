# 显示副本 apply CPU 优化 — 2026-09-23

## 结论与边界

本轮完成 LAN / Steam 共用生产显示副本接收路径的固定布局恢复优化。48 舰冻结源码离线对照中，apply 平均耗时 **20.9155 → 17.9835 ms（减少 14.02%）**，P95 **25.9631 → 24.1125 ms（减少 7.13%）**。线上的完整编码数据及最终副本状态一致，12 个相关既有测试通过。

这是单次、顺序、带 profiler 的 CPU 对照，不是统计显著性结论，也不证明联机延迟、房间容量、长期稳定 60 Hz 或渲染 FPS。最大 apply 耗时 33.1237 → 35.4945 ms，二进制 decode 平均 2.9922 → 3.0561 ms，不能声称所有延迟指标均改善。本轮不追加房间压测；没有原生 Steam / WAN 实机新证据，没有新安装包或安装操作。

## 实现

生产入口为 createLanDisplayWorld / applyLanDisplaySnapshot，不是旧 applyCombatSnapshot。

- src/network/DisplaySnapshotCodec.ts：完成原布局合法性校验后，为精确匹配的布局选择静态恢复函数；原通用恢复循环仍作回退。
- src/network/DisplayRecordRestore.generated.ts：36 个有限、静态字段布局，每次读值仍按原顺序执行深度检查、assertDataField、旧值读取、赋值／递归解码。没有跳过逐字段权限、方法／访问器保护或定义验证。
- scripts/lib/display-restore-shapes.json：从实际生产基线帧采样的字段顺序。scripts/generate-display-record-restorers.mjs 在构建前生成 TS，--check 可校验可复现性；不在运行时生成网络提供的代码，不使用 eval / Function。
- 全部字段及顺序必须相同才走固定路径。新增或改变布局保留通用路径，不需要为了兼容改协议。网络 DTO 的布局元数据在同步解码期间应保持不变，与生产解码器现有使用方式一致。
- 新增生成源码 356,945 B（单独源码 gzip 15,498 B），是用代码体积换取热路径效率；这不是实际应用打包后下载体积，未做浏览器启动／包体评估。

此修改共享于两种传输的上层显示解码器，不修改 LAN / Steam 传输协议、快照请求频率、过载阈值、恢复策略、物理／AI／伤害或玩法界面。视觉／战斗组件实验开关仍为 opt-in。生涯和既有其它改动未纳入本次工作；未暂存、提交、推送、打包、发布或操作桌面。

## 对照方法与一致性

目录：artifacts/network-replica-apply-20260923/。

1. 同一探针：Node v24.13.1，48 舰、2 玩家席位、seed 917、预热 240 tick、测量 360 tick、每 tick 捕获、packed numbers、CPU profiler。
2. baseline.mjs.map 冻结所有源码；final 构建只覆盖 DisplaySnapshotCodec.ts 与新增生成文件。基线／候选使用完全相同的测量和规范化摘要实现。
3. cpu-baseline/result.json 与 cpu-final/result.json 为正式对照。cpu-before / cpu-after 为早期试验，不混用其原始 V8 字节摘要。
4. 完整编码总量均为 **191,596,025 B**；SHA-256 均为 **96abdc97dd535fa8ba20aacf710482aaac99662f817d78fc294d469e4155364f**。
5. 最终副本规范化 SHA-256 均为 **ea81545566d17f1eaa287bfda39d113fe74b86c5e55d654e631f3c627202b999**。摘要包含循环／引用关系、数值特殊值、typed arrays、Map / Set、有序内容、属性描述符等，在计时／profile 区间外计算。
6. 两份 replica.v8 反序列化后 assert.deepStrictEqual 通过。测试还逐帧比较完整数据图，覆盖冷／热恢复、重连、对象身份和错误顺序；不能将有限轨迹一致推断为所有战况的完整等价证明。

| 指标（ms） | 基线 | 候选 |
| --- | ---: | ---: |
| apply 平均 | 20.9155 | 17.9835 |
| apply P50 | 20.5382 | 17.6096 |
| apply P95 | 25.9631 | 24.1125 |
| apply 最大 | 33.1237 | 35.4945 |
| decode 平均 | 2.9922 | 3.0561 |

机器可读汇总为 cpu-comparison.json。探针没有 renderer、IPC、实际网络、计时器／频率上限，不能将循环速度当作可玩或联机 Hz；2 玩家席位也不等于运行了两个真实远端客户端。

## 验证结果

- npm run typecheck：通过。
- 改动文件 oxlint：通过。
- node scripts/generate-display-record-restorers.mjs --check：通过。
- 既有 check-native-capture 场景筛选 ^LAN display|^display decoder dependency closures：**12 / 12 通过**，比较端为 source-before 中冻结的原接收器，其余 Vector2 等身份相关依赖共享。
- 冻结源码 CPU 探针构建与执行：通过（不是应用发布打包）。
- 覆盖所有 36 布局的 guard/read/write 与异常顺序；方法／访问器拒绝、局部字段保留、嵌套对象身份、未知布局回退、深度边界、弹丸列恢复、舰载机／空间站／相位舰／冷加入／重连等。
- 初次新增弹丸列测试因人工夹具不足以触发已有打包阈值而失败；补足实际共享字段后通过，未修改生产打包阈值。

最初的完整 shape 分配候选仅测得约 1.4% 变化、证据不足，已撤回，留存 rejected-shape-candidate.ts；当前交付不含该对象分配修改。原始 v8.serialize 字节会受运行时数字／对象内部表示影响，不能单凭其摘要不同认定逻辑状态不同，因此正式对照采用相同的规范化摘要并追加反序列化深度比较。

## 留档

final-check-status.json、final-typecheck.log、final-lint.log、generator-check.log、final-scenarios.log、build-final.log、cpu-comparison.json 和两组 CPU 结果／profile 均留在上述 artifacts 目录。turn.patch 以本轮 source-before 为基础，只记录本轮范围，不代表仓库整体 diff。后续原生 Steam / WAN、渲染与长期容量验收仍需单独进行。
