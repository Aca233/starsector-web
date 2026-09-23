# 分层同步 Phase 7：无损 motion/visual 二进制传输

日期：2026-09-21。实验分层路径仍默认关闭；没有提交、推送、打包发布或修改生涯模式。**本阶段不是延迟问题已解决的声明。**

## 实现

- `MotionWire.mjs` 保留原 SWM1 的每一个字节（float64、负零、身份、输入 ACK、tick/time）；helper 在浏览器边界还原原 JSON motion 消息。SML1 传输身份包裹 SMX1 全帧/普通 XOR/临时预测参考 XOR。预测仅用于字节压缩，最终必须精确修正、CRC 及 SWM1 校验，不参与显示/模拟。
- 使用同一可靠有序 control WS 的最后**已准入**字节作基准，不等待浏览器 ACK 才能复用压缩基准。浏览器 ACK 仍单独限制实际消费；没有制造 credit。一端至多保留一个 <=11000B 基准，同次发布共享编码结果、至多尝试两个不同旧基准。
- `MotionDeliveryWindow.mayPrepare` 在没有消费槽时跳过编码，而不是让阻塞客机占用共享的两次差异编码机会；并不保留或发送历史帧。
- SVL1 用原始压缩 payload 替代 visual 的 JSON/base64。原分片身份、解压上限和浏览器最终消费不变。**visual 应用信用仍按原 JSON 大小收费**，不是声称它等于实际线缆字节；按更小二进制尺寸放宽信用的试验会挤占世界更新，未保留。
- primary launch 可能先于旧 control 包到达：旧 scope motion 在解码前丢弃，旧 visual 只释放原来的 discarded 债务；当前数据损坏关闭可选通道，primary 完整世界保留。
- 持久诊断加入 motion wire 全帧/差分次数、原始/包字节和保留基准大小，剥除基准内容/身份。

## 验证

`artifacts/network-stream-20260921/`：
- `network-gate-phase7.log`：347/347；包括最后加入的 mayPrepare 测试。
- `tsc-phase7.log`：app TSC 成功。
- real helper motion/visual、错误 scope、CRC、会话/断线回退测试已纳入网络 gate。这里只证明协议/回归，不证明真机 FPS。

## 性能（22 舰录制、各客机独立 Node 进程、真实 WS/deflate/TCP）

同一 FIFO 下行瓶颈；36 字节 match/sync；10 秒各场景、去除前三秒。无游戏应用/渲染、无 n2n/Steam、无丢包。数据见 `layered-phase7-reference-matrix.json` / `layered-phase7-wire-matrix.json`。

| 总人数 / 共享 Mbps | 旧 motion Hz | 新 motion Hz | 旧→新 visual Hz | 最差完整世界 age P95 旧→新 |
|---|---:|---:|---:|---:|
|3 / 4|49.9|52.1–52.4|约11→约17|542→307ms|
|3 / 32|53.1|59.9–60|3.9→19.1|132→95ms|
|4 / 4|50.3–51|53–53.3|11.6–12.6→16.3–16.9|1342→1334ms|
|4 / 32|52.3–52.4|59.9|4.6–5.4→19.3–19.4|145→96ms|
|5 / 4|48.1–48.9|51.9–52.4|9.4–10.7→12.1–14|2112→2755ms（退化）|
|5 / 32|52.1–52.3|58.6–58.7|4.3–5.1→19–19.3|163→112ms|

随后 5 人 / 4Mbps / 60ms RTT 各跑 30 秒（`*-30s.json`）：旧 motion 47.9–48.1Hz，新 52.2–52.3Hz；最差完整世界 age P95 2997→2965ms，**没有实质解决大快照陈旧**。合成 input echo P95 约132→124ms，不是输入到画面的时间。

## 否决实验 / 剩余问题

- 合并 visual/bulk 债务窗口试验导致利用率或公平性退化，未保留生产 hook。`layered-phase7-binary-shared.json` 无效：当时计费 binary 但回调实际发送 JSON；文件已标记 invalid，不能作为效果证据。其余 shared-v2 / independent / credit-stable 工件保留负面记录。
- Steam 未获得这些 helper 可选通道，之前实验 Sockets 326 项中两项失败未因此解决。没有宣称 LAN 回放证明 Steam 可用。
- 正确下一步不是把 bulk 超时阈值无限放宽：HP/幅能/护盾/死亡等当前仍依赖旧世界，需要独立组件时钟；武器/光束/雷/部署及整图进度仍须审计、压缩和真实应用负载验证。
