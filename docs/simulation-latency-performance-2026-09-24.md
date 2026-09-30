# 模拟与状态发布优化（2026-09-24）

## 编码前边界与依据
- 以当前工作区为基线，不覆盖既有生涯改动；独立后台实现，不使用子代理或可见窗口。
- 本机原版 0.98a-RC8；已查看 `decompiled/starfarer_obf/com/fs/starfarer/combat/ai/movement/BasicEngineAI.java:58–95`：朝向/移动目标分别设置，按传入 dt 推进，避碰影响驾驶命令。本轮不改目标选择、候选顺序、步长、避碰评分与命令规则；只允许保守排除不可能接触的预测点，保留边界/非有限值的原计算。
- 原版无 Web Worker/网络投影协议对应实现。状态发布优化属于 Web 实现层，必须保持完整显示读集、顺序、动态字段和脱离权威状态的接收端所有权，不能把渲染 DTO 当存档。
- 无 UI 布局、画质或玩法变化；原版实机/截图对比未执行（用户禁止操作桌面）。

## 当前差异与验证方案
1. 避碰每条候选轨迹的每个预测点均计算精确距离，即使单轴已远离障碍；增加带浮点余量的排除，其他情况保持原 `Math.hypot` 和评分加法顺序。
2. 本地显示投影逐帧生成字段键值对、临时对象和同内容数组，导致额外 GC 与增量节点删除/新增；直接写入投影自有数据字段，复用有界数组身份，不缓存可变模拟值。
3. 网络捕获反复遍历递归不可变元数据；仅对项目 `immutableCopy` 登记的元数据探索帧内复用，未知对象、可变武器参数、周期引用及通用捕获仍走原路径。

同一冻结源码构建前/后，逐步交错执行真实内核、显示编码/解码；比较完整权威帧（定期）、随机数状态和显示读值。性能统计区分模拟、编码/解码、节点与字节，不把无渲染 CPU 基准当 FPS、网络 Hz 或端到端输入延迟。集中一次类型检查、改动文件 lint 和相关现有验收。

## 保留的实现

- `TacticalNavigation.ts`：在局部障碍记录上预计算带浮点余量的单轴距离界；预测点确定在圆外时省去精确距离。候选数量、候选顺序、60 Hz 步长、命中边界和评分累加顺序不变。
- `RenderShipProjection.ts` / `ProjectionArrays.ts`：消除逐字段键值对/临时对象，复用投影自有的武器、引擎、系统列表。每帧仍读取全部显示值；长度缩减、成员替换、稀疏数组和自定义 mapper/species 均处理。WeakSet 限定只有自建列表可复用，不能写回源数组或自定义 mapper 返回的外部数组。
- `AuthorityCombatSnapshot.ts`：仅在原生捕获、无特殊 display/record-delta/journal 模式、无字段投影的情况下，对 `immutableCopy` 创建的递归不可变元数据做**帧内**打包复用。可变 mount spec 仍逐帧读取；不跨帧复用 wire record ID、字典或发布出去的包。现有 `VITE_LAN_CAPTURE_PLANS=false` 也关闭这条路径。
- 修复既有捕获对照脚本仍从旧 facade 读取实现的问题，现在对照真正的 `AuthorityCombatSnapshot.ts`，不是跳过验证。

## 最终 CPU 验收

Node v24.13.1，固定种子 917。本地对照逐 tick 交错前后顺序，60 tick 预热、180 tick 计时；混编为 120 tick 计时。使用真正的 LocalCombatKernel、生产显示编码器与解码器。基准不保留逐帧显示图，避免测量器本身造成堆增长。每 tick 比较 RNG/回放 witness 和舰船/武器显示值，每 30 tick 及结束比较完整权威快照字节。

**以下是串行 CPU 毫秒/步，不是 FPS、真实 Worker TPS 或端到端延迟。没有渲染、rAF、React、音频播放、真实本地 Worker IPC 和 AI Worker 并行成本。生产 Worker 数量/启用条件没有修改。**

| 场景（初始主舰数） | 模拟前→后 ms | 显示采集前→后 ms | 显示解码前→后 ms | 合计前→后 ms | 合计降低 |
|---|---:|---:|---:|---:|---:|
| 24 onslaught/onslaught | 7.35 → 7.26 | 9.22 → 8.61 | 4.42 → 4.31 | 20.99 → 20.17 | 3.9% |
| 100 onslaught/onslaught | 28.70 → 29.06 | 21.20 → 18.82 | 9.54 → 8.85 | 59.44 → 56.73 | 4.5% |
| 200 onslaught/onslaught | 68.94 → 67.81 | 31.74 → 29.29 | 13.36 → 11.95 | 114.04 → 109.05 | 4.4% |
| 24 odyssey/paragon | 13.84 → 13.48 | 13.10 → 12.51 | 6.15 → 6.14 | 33.09 → 32.13 | 2.9% |

混编场景实际运行舰船集合达到 72（含生成单位），前后一致，没有删除舰载机换性能。100 舰模拟均值略增，不能宣称所有场景模拟阶段都变快。先前 local-final-1 诊断中，100/200 舰合计 58.29→54.96 / 110.67→105.52ms；该轮基准保存了不必要的显示采样图，已修正测量器，最终以上表 local-final-2 为准，不挑最快轮次。

100/200 舰每帧变更显示节点平均 2886→2555 / 4314→3638；对应数值传输缓冲区约减少 5.7% / 9.5%。`numericBytes` 仅计 Float64 数据/视觉缓冲区，**不含** structured-clone 字符串、shape、metadata 及 IPC 封装，不能当作完整网络带宽。

### 64 舰 LAN 完整捕获/接收链

使用既有 `benchmark-authority-cpu.mts`，2 艘人控 Onslaught + 62 艘 AI Hammerhead，240 tick 预热 + 240 tick 测量，生产 LAN display、packed numbers、解码及接收端 apply 全部启用。无 profiler 的 ABBA 四轮，以下为两次同构建均值；不是先前那次带 profiler、未开 packed numbers 的定位数据。

| 阶段 | 优化前 ms | 优化后 ms | 降低 |
|---|---:|---:|---:|
| 模拟 | 15.26 | 14.05 | 7.9% |
| 快照采集 | 9.06 | 7.24 | 20.1% |
| 二进制编码 | 5.96 | 5.63 | 5.6% |
| 二进制解码 | 3.35 | 3.18 | 4.9% |
| 显示接收端 apply | 18.00 | 17.31 | 3.8% |

四轮 wire SHA-256 完全一致：`7c9f3591e161caf4011df4db5e35de922b4a6d36d36571702eb99ff5d1b524e3`。
接收端完整数据图规范化哈希完全一致：`51597611e81c2176766e5d68cef4b1e77eedf4c197ebecc6bd8c2f498e67d93a`。

接收端 apply 仍约 17ms，是后续值得独立优化的瓶颈；本轮没有为提速取消消息、字段、资源或原型校验。

## 实际输入延迟：未通过改善验收

真实 dedicated Node authority Worker + binary snapshot IPC 测试，64 舰，12 秒墙钟、前 4 秒预热，发送带序号的中性输入，测量其出现在权威快照 acknowledged 中的回执耗时。它不包含浏览器画面、WebSocket/WAN 或 Steam。

ABBA 前三轮结果：before P95 204.74ms，after P95 203.44 / 214.13ms；均值分别 107.42 / 119.86 / 95.56ms。第四轮 before 出现“计算主机持续过载或暂停过久，恢复失败”，整组 ABBA 不完整，原始失败保留在 `worker-latency.json`，**不作为稳定输入延迟降低的证据**。没有调低生产战斗规模、关闭过载保护、降低 AI/物理频率或改动输入确认语义来让测试通过。

因此本轮结论是：状态发布 CPU 开销减少，串行大舰队整步有约 3%–5% 的改善；不能声称已解决大规模战斗全部瓶颈、200 舰满 60 FPS/TPS，或实际联机输入到画面的延迟已经下降。

## 正确性与工具检查

- `check-simulation-hotpaths.mjs`：507 项对照通过；500 个随机/极端导航场景的完整结果与既有原始算法一致。距离函数调用 772142→226071（-70.7%），这是操作计数，**不是**模拟提速 70.7%。数组身份、缩短/重排、稀疏、源长度变化、自定义 mapper 输出所有权和动态挂点也覆盖。
- `check-render-projection.mjs`：2746 项通过，包含 Onslaught、Odyssey、Doom、Astral、Retribution、Station 的显示读集、动态修改及严格无模拟能力接收图。
- `check-native-capture-plans.mjs`：9 个场景通过，包括 22 舰 900 tick 演进、字典/形状改变、通用 accessor 行为、保留帧独立性、元数据替换和 wire 对照。
- 最终本地对照：27 个同型舰权威快照检查点 + 7 个混编检查点通过；每步 witness 与选定显示值相等。
- `npm run typecheck` 通过；一次新增数组工具的 TypeScript 控制流推断错误已定向修复复查；改动文件 oxlint 无警告/错误；diff whitespace 检查通过。
- 未运行全套 network 测试，未做 WebGL/真实浏览器帧率、原版实机、WAN/Steam 测试。未提交、推送、打包或发布；未修改其他任务的生涯文件。

## 复现

在项目目录运行（现有 frozen.json 不可覆盖；工件不入 Git）：

```powershell
node scripts/benchmark-simulation-latency.mjs --baseline artifacts/simulation-perf-20260924/frozen.json --ships 24,100,200 --warm 60 --steps 180 --out artifacts/simulation-perf-20260924/repeat
node scripts/benchmark-simulation-latency.mjs --baseline artifacts/simulation-perf-20260924/frozen.json --ships 24 --hull odyssey --enemy-hull paragon --warm 60 --steps 120 --out artifacts/simulation-perf-20260924/repeat-mixed
node scripts/check-simulation-hotpaths.mjs
node scripts/check-render-projection.mjs
node scripts/check-native-capture-plans.mjs
```

仅测当前版本可省略 `--baseline`。为将来另一轮更改建立新基线，使用 `--freeze artifacts/<new-directory>/frozen.json` 和同目录 `--out`，不要把当前优化后代码冒充本轮 before。网络四轮报告位于 `network-{1-before,2-after,3-after,4-before}/result.json`，汇总位于 `network-summary.json`；网络构建入口及真实 Worker 探针保存在同一工件目录。
