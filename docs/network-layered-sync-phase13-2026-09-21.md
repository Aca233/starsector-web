# Phase 13：共享粒子精确修正编码（2026-09-21）

**整体目标仍未完成。** 本轮不降低仿真 Hz、不减少特效、不改伤害/碰撞、不放宽 ACK/带宽窗口/1500ms 整世界保护。未开启默认关闭的 layered/critical/weapon 通道；Steam 的独立 helper lanes 也未因此实现。无生涯更改、子代理、可见窗口、桌面输入、提交、推送或发布。

## 改动

- `ParticleMotionReference.mjs/.d.mts`：固定 IEEE 算术构造私有运动参考，使用有界整数 bit-pattern residual 恢复四个原始位置/速度 double。超范围直接发送原 double；不是量化，也不是游戏预测。
- `DynamicParticleRecipe.ts` / `ParticleRecipeKernel.ts`：保留原版 Web 源对象、RNG、数量、更新和现有严格 eligibility 检查；私有回放使用冻结的 armor/burst/debris 生成规则。新增参考只参与压缩，不能直接显示。drag 系数每出生组缓存，至多128项；冷解码 work/steps/rows/group 上限不变。
- `CombatSnapshot.ts`：v2 envelope，兼容读取旧 v1；signed-zero 出生组整体保留原四标量表示，保持直接/JSON 旧语义；其余使用精确修正。LAN、Steam、Node authority 使用同一 capture/restore 接线。不能宣称旧构建可读 v2；既有同 build 入房检查保留。
- 加入独立数值/恶意输入测试、旧/新完整恢复和 signed-zero 测试；生产 Worker 接线断言要求实际出现 residual 行，而非只数 recipe。
- 浏览器测试改为流式读取本地 fixture，避免将全部二进制 base64 一次塞入 CDP 参数；可测全241帧，默认仍抽样。最初一次整批传参出现 page closed，原因未定，该失败不是通过证据。

原版证据、格式与回退边界见 `network-particle-residual-source-notes-2026-09-21.md`。原版桌面实机验证仍待用户许可。

## 同源包体证据

241份 ordinary 录制与 Phase9 留存逐文件完全相同；新提取的241份武器组件也与 Phase11 留存完全相同。只改变粒子表示，不换一个更轻的场景作比较。

对照是**旧 recipe 四 double → 新 recipe 修正表示**（不是更早的普通粒子）：
- 完整快照 deflate-1 平均 **63707 → 57950B（-9.04%）**。
- 独立弹道已就绪时的 compact whole 平均 **45268 → 39501B（-12.74%）**。
- 原始完整二进制平均 **184622 → 178885B**。

实际 Steam binary sender、压缩、分片、receiver / SHA 全状态回环（离线内存传输，不是真 Steam 网络）：

| 录制行间隔 | 状态数 | 旧平均 wire | 新平均 wire | 节省 |
|---|---:|---:|---:|---:|
|1|241|25006B|20768B|16.95%|
|6|41|28449B|23955B|15.80%|
|30|9|37743B|32491B|13.92%|
|60|5|45285B|39003B|13.87%|
|120|3|52169B|46151B|11.54%|

包含首个完整 checkpoint 和实际分片头；每份完整状态 canonical JSON 精确回环。这不是 Steam/n2n ms 实测。

## 3/4/5人配对回放

`legacy-matrix.json` 与 `residual-matrix.json`；相同已有 motion display / wire / weapons / visuals / chunks，20秒去前3秒，22舰录制，人数含房主。独立Node客机、真实loopback TCP/WS，一个共享FIFO，无丢包。不是5个真实人操作的实机游戏；不含物理/capture/apply/render，不运行游戏 bootstrap/resync 状态机。第一次新矩阵因武器 fixture 路径不匹配被正确拒绝；重新从新目录完整还原提取并确认内容完全相同，未放松断言。

| 人数 / 链路 | 运动Hz旧→新 | 最差整世界 arrival P95 | 最差连续观测整世界 P95 |
|---|---|---|---|
|3 / 4Mbps RTT60|53.00–53.35 → 53.18–53.35|660 → 487ms|1172 → 931ms|
|4 / 4Mbps RTT60|52.00–52.53 → 51.65–52.18|1654 → 1445ms|2990 → 2562ms|
|5 / 4Mbps RTT60|42.47–47.53 → 45.41–49.24|2921 → 2743ms|5715 → 5007ms|
|3 / 32Mbps RTT20|59.88 → 59.71|106 → 97ms|315 → 293ms|
|4 / 32Mbps RTT20|59.35–59.41 → 59.29–59.41|108 → 91ms|315 → 290ms|
|5 / 32Mbps RTT20|58.18–58.41 → 58.29–58.59|137 → 107ms|357 → 367ms|

- 5人弱网完整世界只有 **0.41–0.53 → 0.47–0.59Hz**。连续陈旧仍约5秒，不能宣布解决断流、guest60Hz或多人卡顿。
- 5人弱网 warmup 后尚未收到完整状态的样本范围 **0–12 → 0–6**（20ms/样本），单独统计，未伪装成0ms延迟。
- 5人弱网 motion 连续age P95 **102–107 → 99–107ms**，合成输入echo P95 **133.83 → 133.77ms**；输入延迟没有可声称的明显改善。
- 5人弱网 visual 连续age最差 P95 **361 → 367ms**；健康5人整世界连续age回退约10ms。不能宣称所有条件不回退。
- 发送进程CPU总量（20s）弱网3/4/5人 **7734/6407/9031 → 8172/7250/9735ms**；新方案传输了更多完整状态，也消耗更多CPU。健康3/4/5人 **6750/6812/9000 → 6594/6578/9578ms**。没有普遍CPU改善结论。
- 两侧全部 case errors=[]；这不等于真实游戏不会因1500ms保护触发重同步。仅一次顺序对照，不是统计显著性证明。

## 未采用的试验

`matcher-experiment.*`：更短copy、更密索引、向前扩展只有约0–2%收益；未修改生产 byte matcher。
`xor-experiment.*`：朴素literal XOR反而增加流量；未接入协议。
Phase7/12已否定的共享信用池仍未恢复，原 caps/超时保留。

## 剩余验收

完整状态传送/组件化仍是根本瓶颈，尤其5人弱网；不能用运动接收Hz替代整世界新鲜度或客户端FPS。后续继续拆解完整状态传送等待、调度与剩余组件，最终还需3/4/5人实际Steam和n2n网络与浏览器apply/render验证。

## 最终验收

- 最终全量无头浏览器：`browser-streamed-corrected.log`。**247份完整还原逐字节一致**（241录制+6fixture）、**45208个 residual 行**、1024组 Node/Chromium 固定参考结果完全一致；6个实际640×360 WebGL FX画面逐像素一致，0 page errors。
- 同一最终流式测试、同一247帧：旧表示 `browser-legacy-streamed.log` 为0 residual /45208 absolute，recipe apply P50/P95 **2.5/3.3ms**；新表示 **2.4/3.2ms**。各次 ordinary 对照为 **2.3/3.0ms** 与 **2.1/2.5ms**，说明运行波动存在；不能把0.1ms差异说成可靠加速。早期27帧结果有3.4→3.8ms回退，后来加入有界drag缓存；不用不同样本数作CPU同比证明。均非原版实机截图或游戏FPS测量。
- 全量流式测试第一次被 Vite SPA fallback 返回HTML，已将只读fixture中间件移至 `configureServer` 前置阶段，并验证 response content-type；仅 `browser-streamed-corrected.log` / `browser-legacy-streamed.log` 是最终全量通过工件，前面的失败日志保留。
- `network:check`：**383/383 +5/5**。
- `network:check:shared`：**22/22、6/6、81/81**（存在重叠，不合计成独立测试数）。三种实际生产 Worker 能力模式均捕获 **158个实际residual行**，经 LAN envelope、Steam binary、legacy JSON、Node summary 全状态回环。
- `steam:check`：**337/337**。
- `npx tsc -b --pretty false` 和相关文件 oxlint：通过。
- worker-only 后台测试bundle（非发布包，无campaign输入），22舰、12秒、整包消费人为延迟200ms：physics **59.958Hz**，motion **716/716** 已投影，combat **240/240** 带武器、42240行，errors/recoveries均空。整包产生 **4.67Hz** 是该200ms测试消费条件下的结果，不是客机FPS；本测试不能保证用户设备/实际Steam路由的60Hz。

所有本轮测试进程均已结束；没有留下后台游戏/可见窗口。最终相关源码与报告 hash 在 `artifacts/network-stream-20260921/phase13/source-sha256.json`。目标仍 active，未声明完成。
