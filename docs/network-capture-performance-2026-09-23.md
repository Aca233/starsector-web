# 生产状态构造优化与 48 舰复查 — 2026-09-23

## 结论与边界

本轮针对上一批 48 舰持续过载继续工作。**生产状态构造 CPU 探针测得约 30% 捕获耗时下降；原参数 48 舰短房间场景这次通过，8 秒活跃阶段无过载恢复。** 不能据此宣布长期稳定容量、稳定 60 Hz、60 FPS 或真实 Steam/WAN 验收完成。

优化处于共享 `captureLanDisplayCombat` 路径，对普通 LAN/Steam 房主 Worker 和 dedicated authority 生效，无需两端复制不同逻辑。没有改变模拟步长、AI/物理/伤害规则、快照目标频率、过载阈值或恢复预算；没有启用历史未通过的 AI/serializer Worker。没有改生涯、提交、推送、发布或操作桌面。

## 定位：先测真正的生产路径

已有 `benchmark-authority-cpu.mts` 原本固定 22 舰且调用旧 `captureAuthorityCombat`，不能直接解释生产 48 舰的 capture 开销。因此为该既有探针增加有界参数：`--capture lan-display --ships 48 --players 2 --packed-numbers`，仍保留原 legacy 默认模式供历史诊断使用，没有新建测试工程。

基线与候选使用相同种子 917、240 tick 预热、360 tick 采样、每 tick 捕获，均启用 500 μs Node inspector CPU sampling。两次都跑真实 `createLanWorld` 和生产 `captureLanDisplayCombat`，但没有 IPC、计时器节流、网络、显示副本或 GPU，不能冒充房间容量。快照字节包含实际捕获内容，刻意不用变化的诊断墙钟值污染一致性哈希。

基线热点包括：
- 每帧新建 `LanShipProjection`，令内部 `RenderWeaponDictionary` 反复重建签名/只读定义。
- 新分配的舰船、武器、系统 DTO 失去身份缓存，`nativeCaptureShape` 反复构造字段签名。
- 同一舰船的 `system / systems / allSystems` 别名重复执行相同的纯显示采样。

采样自耗时中 `nativeCaptureShape` 约 1386 ms、武器 `signature` 约 707 ms（360 个采样 tick 的累计 CPU 样本归因，不是单帧延迟）。原始 profile 保存在证据目录，不以墙钟平滑诊断冒充 CPU 归因。

## 改动

### 1. 每个引擎复用投影器

`AuthorityCombatSnapshot.ts` 使用 `WeakMap<CombatEngine, LanShipProjection>`。每帧仍 `begin()` 重新采样，完成后 `finish()` 维护当帧定义可达集合。缓存随引擎可回收；没有跨引擎或跨接收端共享可变快照。

### 2. 复用临时数据布局，不缓存旧数值

`display/LanShipProjection.ts` 用弱身份表保存舰船/组件的临时只读投影形状：
- 每次调用重新读取所有字段，包括 `undefined`、动态角度、系统状态、护盾/辐能和装甲数据。
- 同一舰船内同一个原生系统仅采样一次，再用于多个别名；它们在编码时仍独立完整展开。
- 创建宽记录时一次定义完整字段集合。第一次候选逐个增添属性会触发 V8 dictionary-mode，使 `packFresh/Object.values` 的成本上升；已修正为完整形状初始化。该中间候选的 profile/结果也保留，没有隐藏不理想结果。
- `pack()` 仍生成每个快照独立拥有的可变 wire 数据。没有引入时间增量基线、漏字段、复用可变数组或恢复旧帧的依赖。

### 3. 验证实际消费与所有权

在既有 `check-native-capture.mts` 增加一个聚焦回归：暖投影与冷投影逐项一致；改变舰船、武器、辐能、护盾和装甲后，显示副本读取到最新值；之前捕获的快照重编码仍逐字节不变；捕获不消耗随机数；同 tick 重发不依赖前一次序列化。

## 固定轨迹 CPU 结果

| 指标 | 修改前 | 最终候选 |
| --- | ---: | ---: |
| capture 平均 | 18.13 ms | 12.71 ms |
| capture P50 | 18.01 ms | 12.28 ms |
| capture P95 | 21.73 ms | 17.28 ms |
| capture 最大 | 24.70 ms | 34.46 ms |
| 整段探针墙钟 | 12.38 s | 11.60 s |
| simulation 平均 | 11.05 ms | 13.66 ms |
| encode 平均 | 4.87 ms | 5.51 ms |

平均捕获下降约 **29.93%**，但最大值并未改善。未改动的 simulation/encode 也出现时序波动，说明这是共享电脑上带 profiler 的顺序单次对照，不是隔离硬件下的统计置信结论。不能把 30% 捕获收益写成整机/FPS 提升 30%。

两边都生成 **191,596,025 B**，360 帧串联 SHA-256 完全相同：

`96abdc97dd535fa8ba20aacf710482aaac99662f817d78fc294d469e4155364f`

这个证据证明的是这组确定轨迹的完整二进制一致，不是对所有模组或所有战况的穷尽证明。

## 原参数实际房间复查

命令保持上一批规模：

```text
node scripts/build-battle-server.mjs artifacts/network-capture-20260923/runtime --worker-only --benchmarks
node artifacts/network-capture-20260923/runtime/room-benchmark.mjs --runtime artifacts/network-capture-20260923/runtime --ships 48 --rooms 1 --active-seconds 8 --apply-replica --no-motion-reference --out artifacts/network-capture-20260923/room-48.json
```

这只是后台基准 runtime 构建，不是发布包。真实 authority Worker、relay、两个独立 Worker 显示副本和本机 WebSocket，`autoMotion:false`，不用额外运动通道掩盖完整世界吞吐。

本轮仅跑一次最终房间复查：报告 `passed:true`，建房/启动、输入采样和清理完成。

| 8.003 秒活跃阶段 | 结果 |
| --- | ---: |
| 过载恢复 | 0 |
| 模拟推进 | 468 tick，约 58.48 tick/s |
| 完整快照生产 | 122 帧，15.24 Hz |
| 两个副本实际应用 | 各约 15.12 Hz |
| 副本 decode 平均 | 4.55 / 4.70 ms |
| 副本 apply 平均 | 17.41 / 17.37 ms |
| 输入 ACK P95（应用后） | 165.58 / 161.63 ms |
| 每端本机链路统计 | 约 2.65 Mbps |

这是应用层 ACK 和无头副本应用率，不是 input-to-photon，也不是浏览器绘制/GPU FPS。末段 Worker 仍有约 115.53 ms backlog、平滑 realtimeRatio 约 0.952，不能称为稳定无余量风险的 60 Hz。

上一批相同 CLI/舰队规模的短测曾因两次恢复后过载中止；本轮由失败变为通过是有效进展，但房间种子未固定、主机共享负载也未隔离，不能将两次房间记录当成严格同轨迹配对。固定种子字节/CPU 对照与实际房间通过必须分别解释。

## 检查记录

- 集中类型检查及改动文件 lint：通过。
- 初次相关显示场景 4/4：冷加入/预备部署/航母生命周期/重连、显示 sidecar、空间站/相位舰、新增复用与旧帧所有权。
- 针对首次候选 profile 暴露的宽记录布局退化做一次定向修正，最终类型/lint、冷加入与新回归 2/2 通过。
- 没有重跑全工程测试、没有重复跑房间场景追求通过；原生 Steam/WAN/浏览器画面本轮未验。

证据目录：`artifacts/network-capture-20260923/`，主要文件：
- `cpu-before/result.json`、`cpu-final/result.json`、各自 `cpu.cpuprofile`；
- `cpu-after/`：中间候选，保留布局退化证据；
- `cpu-comparison.json`、`cpu-hotspots.json`；
- `check-status.json`、`final-check-status.json` 和场景日志；
- `room-48.json`、`room-48-status.json`；
- `source-before/`、`capture-working-diff.patch`：以本轮前工作版本为基准，不覆盖其它未提交工作。

## 下一步，不冒充全部对齐

短场景未再过载，但仍需更长战斗、多房间/多人、真实 Steam/WAN 验收。下一项可量化瓶颈是显示副本 apply（当前约 17.4 ms），同时普通玩家房主完整/去弹丸世界成对上传仍待收尾。分层通道不因这次 CPU 优化自动转成默认，Native Sockets 与 AI/serializer Worker 的既有限制不变。
