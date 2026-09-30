# v2 捕获片段驻留：否决与恢复路径诊断（2026-09-26）

## 决策

**不保留生产候选。** 新的内容片段驻留与帧内对象键速查未达到编码前写定的性能门槛，已精确回退。默认 v1、接收器与发送/呈现策略未改，v2 仍默认关闭。

这不是发现了可发布的加速。保留的是：一次可追溯的候选淘汰、原保留版本的 CPU 定位证据，以及现有 CPU 构建工具的显式 `--display-definitions` 诊断开关。

## 候选及正确性

候选将已完成原有准入扫描的同内容 fragment 在有界缓存中规范化，再用帧内 fragment 身份速查。仍保留完整字符串回退查重，避免驻留逐出后同内容对象获得不同索引。

- 每次源端原型/键/descriptor/value 检查不省略；没有可变根身份缓存，不冻结源对象。
- 驻留表限256项、2,097,152字符、400,000节点；帧内身份速查最多1,024项。
- 不改变v2语法、字段、采样位置、接收所有权或任何模拟频率/精度。
- TypeScript检查和改动lint退出0；相关既有场景 **10/10** 通过。
- 专用回归覆盖三重缓存预算、逐出后的完整字符串去重、旧frame不可被改写、同帧/跨帧修改、源访问器拒绝、Proxy的原型/键/descriptor读取顺序、帧内缓存容量。
- 全部四个正式性能臂的累计 wire hash、字节数和末态完整 receiver 对象图 hash 一致。

## 唯一正式 ABBA（无探针）

完整方法、门槛在 source-notes 和运行前生成的 measurement-manifest 中。冻结源码，64舰、2玩家、seed917，每轮240预热+240测量；真实 LAN v2 capture→binary→decode→apply，无 renderer/network/IPC。

每对 capture 均值须至少下降3%，capture P95不得增加3%以上；权威三段与串行五段均值/P95都不得增加1%以上。

| 配对 | capture均值 ms | capture P95 ms | 权威三段均值 ms | 串行五段均值 ms |
|---|---:|---:|---:|---:|
| 1-before → 2-after | 15.5357 → 15.2151 | 20.7590 → 20.0003 | 46.1568 → 46.0311 | 64.6889 → 64.8277 |
| 4-before → 3-after | 8.4268 → 17.1749 | 12.1976 → 25.4109 | 25.0419 → 51.8592 | 35.9925 → 71.8668 |

第一对capture仅下降 **2.064%**，已不满足3%门槛；全链路均值还上升0.215%。第二对不通过，并且不同时间段的各阶段均有大幅波动。**不能从第二对声称该小改动导致约两倍退化，也没有证据确认具体系统负载原因。** 本组不足以证明可保留的稳定收益；没有排除“坏”臂、放宽门槛或择优重跑。

四臂输出：
- wire SHA256：`8c29e7eea96d3e16c3f22f1f4023f75ccea101afeaa66b0a36954942ec758a6a`
- 完整receiver图 SHA256：`fa450d46281577bdfe149adf4f83151acaf8693e7eb56b0c871e40c3bc290511`
- 每臂累计未压缩binary字节：93,507,933。

## 拒绝后只对保留版本做一次定位

性能决定不再改变。使用同一冻结 `before.mjs`，通过既有 `--profile` 单独运行一次相同规模。该运行带500us CPU采样，不是第五个性能臂，不加入上表。

全部9,383个采样中，2,141个处于capture调用栈。按函数聚合，inclusive在每个栈样本内去重：

| 函数 | capture内自耗时样本 | capture内inclusive样本 |
|---|---:|---:|
| packFresh | 522 | 1,555 |
| DisplayDefinitionCapture.inspect | 387 | 387 |
| nativeCaptureShape | 275 | 275 |
| LanShipProjection.pick | 190 | 217 |
| LanShipProjection.project | 121 | 511 |
| DisplayDefinitionCapture.reference | 40 | 442 |

定义捕获模块的源码行采样：
- `Object.getOwnPropertyDescriptor(value, key)`：275个line ticks。
- 比较已验证的键及Object.is值：55个。
- `this.indices.get(fragment.text)`：32个。

这支持**不要继续把长字符串Map查重当成当前主要优化方向**：本样本集中，逐字段准入比查表明显更突出。自耗时/inclusive嵌套不能相加，line ticks与样本不能混为精确阶段时间；GC/调度、内联和采样误差也不被排除。未测真实联机输入→画面尾部。

## 下一步约束

- 下一候选应针对同一数据上反复执行的字段准入/捕获，或默认路径的完整pack工作，而非继续做相似字符串查表微调。
- 如果研究批量读取descriptor，必须先证明普通对象来源、访问器与Proxy可观察顺序等价，不能把所有plain-looking对象当作非Proxy，也不能直接删除原检查。没有这个证据就不能默认启用。
- 不按地址跳过可变spec；不要重复旧validator标量helper/自有字段快分支等已经失败的候选。
- v2默认晋升仍需完整权威端成本、可写receiver兼容及真实ACK→draw验证。本次失败和profile不放宽这些条件。

## 回退、保留与验收边界

- `DisplayDefinitionCapture.ts` 按本轮原始字节备份精确恢复。
- 本轮新增的 `DisplayDefinitionFragments.ts` 已在验证绝对路径属于工作区后删除。
- 专用测试依赖该helper，故与候选一起撤回；回退前验证旧测试文件是当前文件的完整前缀，没有覆盖并行改动。
- 完整候选源码/测试存入 `rejected-candidate-files.json`。回退后两个TS文件转译检查通过；没有重跑全项目或正式性能组。
- 只保留 `build-authority-cpu-probe.mjs` 的显式 `--display-definitions` 构建开关；不带参数仍与原env默认一致。它仅用于离线探针，不修改用户环境或生产默认设置。
- 冻结前后构建图唯一生产差异为本候选两文件。资产manifest运行前后SHA不变；当前工作区其它并行源码改动不覆盖，也不冒称已全部验收。
- 所有运行均已结束，无待轮询session。无子代理、桌面输入、暂存/提交/推送/打包/发布。优化总目标仍未完成。

## 工件

目录 `artifacts/display-fragment-interning-20260926/`：

- `measurement-manifest.json`、`decision.json`、`run-performance.mjs`。
- `before.mjs`/`after.mjs` 及sourcemap/source-hash清单；四臂result/samples/replica。
- `check-status.json`、`contracts.log`、`typecheck.log`、`lint.log`。
- `before/` 原始备份、`rejected-candidate-files.json`、`rollback-verification.json`。
- `retained-profile/cpu.cpuprofile`、`retained-profile/analysis.json`、`analyze-profile.mjs`；这里只作原因诊断。
