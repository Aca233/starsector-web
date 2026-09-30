# 普通房主本地发送预检：来源与边界（2026-09-25）

## 原版证据与范围
本轮仅修改 Web 联机私有 Worker 的发送前预检，不修改原版玩法、物理/AI、UI、舰船规模、模拟目标频率或音效预算。没有原版对应的 MessagePort/WebSocket 协议；以当前既有协议与所有权实现作为依据。不需要/未进行原版桌面操作。

- src/network/host.worker.ts：snapshot() 在真实显示/发送单槽允许后 captureLanDisplayCombat、编码并转移所有权；网络声音只在实际 dispatch 时退休。终局有强制发布路径。异步序列化仍是 opt-in。
- src/network/AuthorityIoBridge.mjs：publish() 才执行 active + RealtimeSendGate，堵塞时已编码的数据会被丢弃；skipped 是本地未准入，不是远端回执。
- src/network/RealtimeSendPolicy.mjs：input/motion/snapshot 可在 16.67ms 内各占一次同批次；不得把它替换为一概 buffered==0。
- src/network/lan-socket.worker.ts：outbound 为主线程预约与原生 WebSocket bufferedAmount 的原子合计；已有有积压时 4ms 排空采样。
- src/network/AuthorityLocalCompletion.mjs：独立的精确 tick/attempt 完成日志。此次不更改其布局、回执或释放条件。

## 差异 → 最小方案
此前 authority 不知道 IO 已确定不能准入，可能每次冷却结束又捕获/编码/跨线程传递一份必被丢弃的快照。
新增单个 Int32 的可选、每端口独立的共享提示：未知/撤销、当前可尝试、当前受阻。仅 IO 写入，authority 不等待/不自旋。提示不授予信用、不预约队列、不替代真正发送时校验。普通房主只在明确受阻时跳过网络捕获/编码/transfer；本地显示仍独立运行；终局绕过提示。关闭/重绑清除旧引用；缺失提示/禁用共享能力走原行为。
排空提示复用原有 4ms timer，无空闲常驻轮询；既要监测 native bytes，也要监测尚未交接的主线程预约，避免预约回滚后提示永久卡住。不通过预检调用重置 RealtimeSendGate，保留原同批次期限。
异步编码的预提交及结果 dispatch 也检查提示；不发送时不消费声音，不保留旧 payload 队列。竞态导致提示过时只可能多做一次工作，实际发送门仍严格兜底。

## 验证计划
集中运行类型检查、修改文件 lint、既有 authority/发布单槽场景，并扩展已有真实浏览器 socket 场景验证排空及回滚。验证终局、禁用/缺失 SAB、旧 epoch、同批次 motion-first 及到期、发送失败、编码期间状态变化。用冻结的前置源码与现实现对照被阻塞期间 capture/encode/transfer 数量、声音和恢复时 tick；这仅证明工作量减少，不是公网延迟或 FPS 提升。保留未涉及的 campaign 修改，不打包/提交/发布。

## 完成时补充
- 提示单独占 4 字节，不复用/改变 68 字节完成日志。IO bridge 仅在拥有排空监测的调用方显式启用 sharedAdmission 时提供提示。
- 已明确受阻时也不创建仅供另一路稍后编码使用的 ProjectionEncodingCache；保留单份 world projection 以便同 tick 排空后复用。
- preflightSkips 为累计“原先网络单槽已允许、但被本地提示阻止”的检查次数；同一 tick 可多次增加，绝不是丢包数、远端回执或唯一帧数。
- 开关 VITE_LAN_IO_ADMISSION=false 禁用本次预检；现有 VITE_LAN_LOCAL_IO_CREDIT=false 也会禁用共享提示。仅用于构建时控制，不增加用户 UI。
