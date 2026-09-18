# 联机优先：重复计算优化与真实双端复核（2026-09-18）

## 当前结论

**大规模联机仍未修好，目标未完成。** 本轮保留两个小而局部的减重复工作改动；小规模双端刷新/断线后操控通过，但同一隔离构建的 32 舰和 100 舰实测仍因计算主机过载停止。不能把纯模拟的少量耗时下降宣传成服务器/FPS/百舰实时联机改善。

3005（PID 18988）及原 dist 未替换、未重启。SnapshotPlayback、MotionPrediction、60 Hz 物理、舰船/特效数量、AI/伤害规则与过载恢复次数均未改变。此前已接受的快照饥饿修复、无损编码校验缓存及先上传后显示逻辑保持不变。

## 本轮正式改动

- `src/engine/ai/ShipCombatProfile.ts`：跳过**相邻且 Object.is 完全相同**的射界候选。无全局 Set 去重，无角度量化，无 trig/hypot 算法替换。
  - 同一候选紧接着重复时，第一次若胜出，下一次不会再次改变结果；若未胜出，下一次比较状态仍相同。
  - 中间出现别的候选时仍重新计算和比较，保留容差比较可能不满足传递性的原始行为。+0/-0 不混淆。
- `src/engine/ai/AutofireController.ts`：自动索敌扫描与原有 preAim 一样，先排除同队舰船，再创建目标对象、执行原有校验。所有敌舰保持原顺序和后续校验；不缓存可变战场状态。

另一个 Map 缓存 score/offset 的实验已撤下；其正确性通过但完整模拟对照更慢。未修改 Vector2，不把 artifacts 中的 Map 源码当成正式功能。

## 验证方法与结果

### 正确性

- 从当前依赖图冻结 439 个源文件，避免其他任务在测量过程中改变依赖。
- 30,000 项候选比较边界检查通过，覆盖重复候选、0/-0、非有限值、固定炮/宽射界、环绕端点和容差附近的权重。
- 最终两个改动一起运行：固定 seed=2232494901，2 真人守护者 + 每队 49 锤头，100 舰全部部署，1200 步。
- 两轮各在 tick 60/300/600/900/1200 比较完整表现投影字符串；最终版本共 10 个检查点与同源基线一致。这不是所有内部私有状态逐帧的穷举证明。
- typecheck、lint、隔离生产构建通过（构建仍有既有的大 chunk 警告）。

### 性能边界

长轮顺序运行曾出现明显机器负载漂移（相同基线平均从约 47ms 到约 21ms），不据此宣称大幅收益。最终改为两个独立浏览器上下文每 60 步交错运行、交替先后顺序，排除前 60 步预热，并反转初始化顺序复测：

| 最终版本同源对照 | 原 ms/步 | 新 ms/步 | 观察到的下降 |
| --- | ---: | ---: | ---: |
| 交错第一轮 | 23.0921 | 22.4894 | 2.61% |
| 反转顺序复测 | 18.5591 | 18.4360 | 0.66% |

只表明本次固定场景的小幅耗时差异，不是稳定统计意义上的百分比承诺，更不是端到端联机改善。后台其他任务/服务未停止；环境负载未完全控制。Map 实验期间另有一次并发 typecheck/lint，因此该实验不用于精确收益推断。

## 隔离生产双端

- 构建：`2026-09-18T04:22:00.597Z`。
- 输出：`artifacts/lan-pure-compute-preview`。
- Worker：`host.worker-CTvB1qzI.js`。
- 本机临时 LAN 服务，两个独立浏览器上下文；固定种子仅在内存加载服务端模块时替换，未修改正式服务端文件。
- 经 UI 创建/加入房间、导入各自配装、准备/开始；AI 编成用既有 options 协议设置，不声称完整 AI 编队编辑 UI 验收。

### 8 舰：短时功能通过

约 15 秒无解码探针的采样窗口为 0.99925×。之后核对实际 W 按下/释放、权威快照 throttle=1/0、ack 前进：

| 阶段 | 按下确认 tick | 释放确认 tick |
| --- | ---: | ---: |
| 初始 | 950 | 956 |
| 刷新客机后 | 1043 | 1052 |
| 主动关闭客机 WebSocket、自动重连后 | 1130 | 1139 |

两个重连阶段均获得新 syncId，恢复 controls-ready 后再操控。最终双方 loaded、服务器 running；0 Worker recovery/error、0 pageerror。此为本机小规模短时功能验证，不是实际跨机高延迟、丢包、Steam 或长时稳定性认证。

### 32 / 100 舰：明确失败

| 规模 | 最后服务端 tick | 终止时 Worker tick | 结果 |
| --- | ---: | ---: | --- |
| 32 舰 | 1618 | 1630 | 两次 backlog 恢复后，第三次过载结束 |
| 100 舰 | 61 | 73 | 两次 backlog 恢复后，第三次过载结束 |

32 舰终止诊断 simulationMs=32.425、backlog=256.87ms；100 舰终止诊断 simulationMs=31.817、backlog=320.60ms、窗口 realtimeRatio≈0.5002。这些是当时 Worker 遥测的窗口值，非整场 CPU 均值。没有放宽恢复限制、减少舰船、降低物理频率或把失败记作通过。

## 证据与收尾

- `artifacts/lan-pure-compute-frozen-sources.json`
- `artifacts/lan-pure-compute-profile-source.json`、`-profile-boundaries.json`、`-profile-differential.json`（Map 实验，已撤）
- `artifacts/lan-pure-compute-adjacent-source.json`、`-adjacent-boundaries.json`、`-adjacent-differential.json`
- `artifacts/lan-pure-compute-allies-source.json`、`-final-source.json`
- `artifacts/lan-pure-compute-interleaved.json`、`-interleaved-repeat.json`
- `artifacts/lan-pure-compute-build-sources.json`
- `artifacts/lan-pure-compute-reconnect-live.json`、`-scale-live.json`
- `artifacts/lan-pure-compute-disposition.json`

未新增项目测试脚本或测试运行器，未进行素材 hash/size 人工审计。验证代码经 stdin / 内存 Vite 模块执行，产物在忽略的 artifacts。所有本轮临时 Vite、LAN 服务和浏览器已关闭；4185 不再监听。

下一步仍应围绕真实 host Worker 的计算预算/突发耗时，而非继续把服务器 RTT 或画面 FPS 当成物理速度。两个纯模拟复测不足以定位生产 Worker 冷启动、交战期或并行渲染竞争各自占比，不能未经采样就把失败归咎于某个因素。
