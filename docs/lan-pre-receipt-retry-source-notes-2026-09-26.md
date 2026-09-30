# 消费回执前的空队列输入重试：源审阅与预注册（2026-09-26）

## 证据及区别

上一轮late-pose已否决并回退。其已有数据按同一事件分段：2-after忙时总延迟P95对应事件213.585ms中，发送前等待163.515ms；这不是GPU/网络RTT归因。更早输入准入诊断1259次中568次拒绝，455次关联最近消费回执和正缓冲。历史receipt-input-tail让回执在非空队列后授予一份输入尾部额度，虽局部降低发送等待但未过完整门槛，保持否决。

当前源码：LanBattle.sendInput在DOM边沿及60Hz定时器尝试，submitRealtimeInput先检查canSend再检查预算，不保留历史payload；protocol.receiptSender在消费完成后发送可靠回执；RealtimeSendGate保留空队列准入和既有一tick input/motion/snapshot伴随额度。本轮不改该Gate，不授予回执尾部额度。

新机制：仅把失败发送记为一个待重试位；下一次真实消费回执发送前，若连接仍是同一socket、OPEN/ready、观察到bufferedAmount===0，则同步尝试一次最新输入，然后无论输入成功/失败仍正常发送该合法回执。保持原发送预算与二次准入检查。没有新timer/microtask/Worker消息/完整draw，也没有额外输入payload队列。

这是Web传输调度，不改原版玩法/UI、物理/火控，不声称原版实机等价。仍后台无头。

## 边界（编码前固定）

- LanConnection仅允许一位输入重试所有者，注册有身份安全的解除函数；LanBattle销毁解绑，连接完整关闭清除，软重连保留所有权但ready/socket/同步门槛仍有效。
- 只有原sendInput尝试失败才标记待重试；成功或未launch/sync/ready直接清除。重试重新取最新keys/aim/actions，不重发过时payload；未成功仍保留动作与序号。
- 回执前队列必须观察为空；非空、NaN、负数、非OPEN、未ready、旧socket不能触发。发送本身还要通过原canSendInput和75/s预算；不靠扩大在途窗口提速。
- 不为discardWithoutSend的motion丢弃构造回执/重试。所有真实回执字段/status保持；如果重试回调抛错，用finally尝试合法回执后传播错误，不能静默吞掉消费错误。重试防同步重入。
- 无待重试输入时，不增加输入包。一次成功后取消需求；动作仅成功接受后清空。丢焦/权限/结束等仍走原resetInput和权限检查。
- 不改接收信用、确认语义、服务器校验、模拟频率/精度、实体/字段/效果或绘制时钟；Worker/display-v2仍关闭。

## 验证与验收（编码前固定）

- 扩充既有真实LanConnection/LanBattle离线夹具，验证LAN与Steam路由的空队列前置顺序、非空不放行、最新输入、动作单次提交、失败重试、预算、ready/同步/焦点/解绑/旧socket/抛错和重入；历史基线夹具仍可运行。
- 集中一次typecheck、改动lint、既有realtime-send与新合同、既有消费回执合同和测量合同；具体失败才定向复查。
- 四臂ABBA（1→2、4→3），2玩家+20AI，seed917、1280×720、D3D11、main、Worker/v2=false。每臂20秒（普通10秒+复合DOM输入后70ms主线程忙10秒），固定250ms输入不改；四臂保留真实主机800ms停顿/ACK推进、同局重连、清理。
- 冻结既有756文件图含52raw CSS及三入口编译CSS，唯一生产差异LanBattle.tsx/protocol.ts。两者当前hash已核对冻结基线一致；组内锁测试依赖/manifest/hash，不作为最新全UI验收。
- **每对、每阶段**发送P95至少下降15%，累计ACK覆盖后draw P95至少下降10%；control→submit和frame gap P95回归各<=3ms；模拟Hz下降<=5%；发送/控制覆盖>=95%，发送/ACK/控制缺失不增加；帧数<=基线1.05倍。四臂所有安全场景通过。
- 指标是DOM事件→本地接受发送/累计ACK观察/实际WebGL提交，不是硬件输入到光子，也不保证某个被覆盖输入实际执行过权威tick。
- 未过门槛精确撤回本轮生产修改（先核对候选SHA），不改门槛/挑样本/原样重跑。不把局部网络收益覆盖画面回归。不复活历史receipt-input-tail或late-pose。
