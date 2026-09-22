# Phase49：当前有效编译产物的五人实测剖析

2026-09-22。**只更新诊断证据，没有修改生产联机代码、dist、安装版或发布版本。**

## 实际测了什么

现有 battle-only 编译产物（2026-09-21T21:42:03.489Z UTC），5 个独立无头 Chromium，通过真实 LAN UI 建房/入房/准备/开始，22 舰，额外等待20秒，测量15秒。确认服务的 index、build ID 和2430个实际主线程/Worker导入源文件哈希；32个watch-only输入漂移单列，不声称重新编译全部当前Tailwind扫描输入。没有启动可见窗口或操作用户桌面。

完整场景通过：真实操舰、同步推进、测量后的房主主线程800ms阻塞期间继续发布、同局客机reload重连及清理。CPU采样在这些压力操作之前结束。原始CPU窗口约16.3–16.5秒，略长于HUD测量窗口，不能混作同一精确时段。

## 关键结果

测量tick1354→2256，15秒推进902步，物理模拟约60.13Hz。

|席位|完整状态Hz中位数|FPS中位数|apply ms|render ms|输入ACK P95 ms的样本中位数|
|---|---:|---:|---:|---:|---:|
|0|28|60.003|4.839|4.468|79.863|
|1|29|60.003|5.017|4.792|102.081|
|2|29|60.003|5.413|5.821|103.231|
|3|28|60.002|5.080|6.959|116.517|
|4|28|60.003|4.843|5.953|95.578|

这里不是把15个P95样本再当成整个会话的P95。房主完整帧生产/上传速率样本中位数同为27.553Hz，采集4.603ms、编码2.862ms、模拟8.64ms；分别为平滑指标，不能相加冒充同一帧的耗时。

测量期间房主blocked、本机上传跳过为0；capture plans启用，57→58 shapes、fallback0，capture复用实际工作。serializer仍为opt-in关闭状态，不能把Phase24未通过的Worker开关直接打开当作修复。22舰，弹体32–133。

## CPU定位

权威Worker idle仅0.99%，fixedUpdate inclusive66.07%，快照/发布inclusive28.49%。其中capture15.61%，pack inclusive15.19% / self11.99%，编码11.75%；CapitalShipAI.update26.49%，ShipWeaponControlSystem.update22.50%，assessThreats11.26% / self4.81%，Autofire.aim8.61%。这些调用树百分比重叠，不能加总。

guest1 idle约30.97%，render inclusive27.04%，applyCombatSnapshots15.72%，restore14.82%，unpack10.77%。当前证据指向权威线程争用预算，并非客机画面只跑十几FPS。没有用(program)或壁钟时间推断GPU瓶颈。

确切被采样的bundle已复制到证据目录并记录hash，minified pack/assessThreats/snapshot/step/capture/encode映射已用该bundle文本核实，而非凭符号名猜测。

## 范围与下一步

这是同机五浏览器、带profiler开销的单次诊断，不是远程Steam/n2n延迟结论，也不是性能A/B提升证据。仍未证明实际5人完整状态稳定60Hz。

下一步应减少权威线程上模拟+捕获+编码的串行工作；若拆线程，必须消除Phase24的额外对象重建/遍历及发布等待，而非重新启用已失败方案。微小粒子恢复、phase查询缓存、降低fire-control门槛等先前否定实验不再重复。

证据：`artifacts/network-stream-20260922/phase49/current-profile-summary.json`、`compiled-current-v2/`、`served-modules/`、`validation-summary.json`。未修改生涯、未提交/推送/发布。
