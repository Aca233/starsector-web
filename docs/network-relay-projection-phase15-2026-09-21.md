# Phase 15：默认房主中转解析优化（2026-09-21）

## 问题与本轮边界

“房主中转没多少可优化”并不准确：还存在重复 CPU 工作。但解析优化不改变房主上行带宽，也不能把原来 5 人弱网下整世界 P95 约 5 秒的陈旧状态自动变成 60Hz。不能把位置插值 Hz、收到整世界 Hz、FPS 和输入到显示延迟混为一谈。

本轮实现前对照：`docs/network-relay-projection-source-notes-2026-09-21.md`。只改网络编解码/校验与观测，不改原版战斗规则、界面、生涯、n2n 或系统网络，不启动可见窗口。

## 真实默认路径的改变

- 旧：浏览器房主上传 SWB1/SWF2 → helper 构建完整对象 → 同一摘要校验器 → LAN 转发原字节；Steam 默认准备 Worker 又从原字节构建完整对象。
- 新：helper 使用 `decodeBinaryStateForRelay`，仅构建摘要校验器读取的字段。**整个包仍经过 preflight，所有省略分支的 map key 仍验证**。不是让房主上传一个自称合法的摘要绕过校验。
- 原始字节、内容、发送节奏、差分基线、消息授权、真正的消费回执、拥塞预算和 1500ms 整世界保护不变。所有客机仍收到完整状态。
- 默认 LAN 二进制上传直接走新路径。真实 Steam 默认 `SnapshotPrepareBroker` Worker 也走新路径，其二进制和旧格式接收方都由 Worker 从原始字节恢复。
- JSON 上传、显式同步 Steam 参考模式、需要完整对象的自定义 transport 自动走完整解析；不能把不完整图交给旧 JSON 编码器。专用 Node authority 没有因此在桌面启动入口自动启用。
- 顺带修正专用 authority 的摘要路径与 auto motion 组合：广播成功时记录已校验的 `r.lastTick`，不再读取刻意省略的 `message.frame.tick`。有二进制摘要→真实消费回执回归测试；这不是声称普通桌面已用 Node authority。

## 可观测性

沿用现有心跳、会话日志，不额外增加探测流量：

```
pipeline.relayDecode.metadataFrames
pipeline.relayDecode.fullFrames
pipeline.relayDecode.lastMs
```

前两项是本局被接受的房主状态累计数；最后一项包含解析与语义校验，不是网络 RTT。JSON 和兼容回退计入 fullFrames；新局清零。它证明路径被执行，不证明 60Hz 或端到端延迟达标。专用 authority 的可信 IPC 摘要不属于房主上传计数。桌面日志仅保留数值，剔除身份/原始状态；过期心跳不继续充当新数据。

## 验证范围

- `check-relay-projection.mjs`：同一摘要校验器比较完整解码/投影解码；两种 wire 编码；160 个有效生成帧、3200 次固定种子变异，外加所有截断位置、毒化 map key（含省略分支）、非法 dictionary key、超深/长度/未知标签、UTF8 兼容回退、重复键、数值宽度以及 craft/deployment/muzzle 校验。
- `check-network-activation.mjs` 新增 3/4/5 客机测试：实际编译的 LanConnection、真实 WebSocket、每位客机自己的生产 DesktopLanBridge，调用真实 sendSnapshot 上传二进制帧；逐帧核对完整弹丸/舰船/规格数据、真正 ACK 与心跳激活计数。没有替换为注入房主摘要。
- `check-steam-binary-host.mjs` 新增默认 SteamGateway + 实际 SnapshotPrepareBroker Worker + 实际 relay 的二进制/旧格式端到端恢复测试；只注入 SDK 收发。同步回退与误传 metadata-only 的拒绝也覆盖。**不是原生 Steam / 公网测试。**
- 专用 authority auto-motion receipt 回归、日志 allowlist/失效/数据隔离回归。
- 首次 LAN 测试失败是预期值含 `-0`、而已有 wire codec 编为 `0`；最终比较同一完整 decoder 的规范状态，未更改 wire 数值语义。初始失败日志保留。

## 性能测量

`artifacts/network-stream-20260921/phase15/relay-projection-benchmark.json` 保存最终数据、源码 SHA256 与录制 SHA256。

使用同一来源的 22 船、241 个实际战斗录制帧，共 43,111,318 字节；暖机后顺序 ABBA 三轮，两路径各 1446 次，均执行同一个语义校验器；每帧摘要相等且输入 SHA256 不变。只测解析+校验的 CPU 耗时。

**未测量/不能声称：**运行中战斗 FPS、端到端输入延迟、事件循环 P95、原生 Steam/n2n、真实用户带宽下 5 人 Hz。无带宽减少，不能用本轮局部 CPU 降幅代替网络延迟降幅。

## 接下来的根本工作

1. 用正式交付的同版本会话日志分辨：房主模拟、capture、codec、发送排队、链路 ACK、客机解码/应用，各自的耗时和实际速率。源码通过不等于安装包已更新。
2. 对弱链路多客机，主线仍是减少每人实际发送字节：细分权威状态的增量/事件协议、必要的基线恢复，确保血量/弹丸等关键状态新鲜，而不是只提高位置流计数。
3. 把关键状态路径与大体积表现/全量恢复解耦，并验证真实有序传输仍存在的阻塞。此前实验不达标的组件继续标注实验，不用“全部打开”冒充解决。
4. 独立 authority 可以减少房主渲染竞争，但普通桌面尚未接入，接入需完成 Steam/生命周期/打包验证；它也不会创造上行带宽。只有日志显示带宽/路由主导时，才考虑合适位置的独立服务器或链路调整，不能承诺换服务器必然低延迟。

## 交付状态

本轮未提交、推送、打包或发布；没有将任何生涯内容打包。已安装 0.2.6 不会因为修改源码而自动得到这些变更。完整回归与最终性能数值见下方执行记录。

### 最终执行记录

- network:check 最终 401/401 + 5/5（network-final.log）。
- network:check:shared：22/22、10/10、84/84，加实际 authority Worker 集成；重叠测试不相加当独立用例。最后补充的投影数值/muzzle用例也在最终 network gate 内。
- steam:check 340/340（steam.log）。
- tsc -b、限定文件 oxlint、git diff --check 均通过；新测试最后一次修改后再次跑 network gate/测试脚本 lint。
- 默认路径集成 21/21（activation-final.log），包括 3/4/5 客机与真实 Steam 准备 Worker。
- 全部测试进程已结束，未留后台测试服务。

最终顺序 ABBA 测量（2026-09-21T01:57:29.672Z，不与回归测试并行）：

| 解析+校验 | 完整对象解析 | 校验投影 |
|---|---:|---:|
| 中位数 | 0.981 ms | 0.795 ms |
| P95 | 1.577 ms | 1.051 ms |
| 1446 次总计 | 1532.123 ms | 1199.457 ms |

中位数降低 19.0%，总耗时降低 21.7%。这只是本机录制回放的单个 CPU 环节；尾部数值受调度影响，不能据此承诺玩家 ms/Hz。

检查时工作区 dist/lan-build.json 仍为 2026-09-19T16:57:58.136Z；HEAD 仍为 d856661（v0.2.6）。当前源码与此旧构建不是同一个交付物。
