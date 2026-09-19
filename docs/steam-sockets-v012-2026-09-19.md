# Steam Sockets v012 原生发送边界（2026-09-19，未启用）

## 与用户问题的关系

用户报告桌面 Steam 联机“延迟非常大，然后断开连接”。已有默认可靠 FIFO 路径在九客机共享上行骤降模型仍会把确认堵住，触发原有 8 秒保护。本轮不延长保护，也不把关闭行为改成无期限等待。

本轮完成的是下一条发送路径的**原生 ABI／所有权边界**：`server/steam/sockets-v012.mjs`。目的是让控制／输入、完整基准、可替换状态能够采用不同的发送优先级和可靠性。它还不是可供玩家使用的完整网络适配器，SteamGateway 不导入它，默认桌面／Steam 后端依赖图仍不包含它。本轮未修改默认网关发送策略，未创建新游戏发布包，v3 ZIP 保持不变。

## 关键新发现：不能照最新 SDK 绑定

实际安装 DLL 导出 Sockets **v012**。调查时第三方 SDK 镜像 main 已是 SDK v1.65(a)，提交 `df2baabf574a738ef1ea90a7e89339107fc0a279`，其头文件是 Sockets **v013**：

| 项目 | v012（本项目固定目标） | v013（不能套用） |
| --- | --- | --- |
| flat SendMessages | self、count、messages、results | 另有 bDeleteFailedMessages |
| 发送消息所有权 | 调用后全部归 SDK，包括发送失败 | 由新增参数决定失败消息的所有权／指针数组改写 |

本实现固定参考 SDK **v1.63** 提交 `494c2d680b9e47bbc369496b57568f44ef2f6796`，接口名为 SteamNetworkingSockets012。类型版本不是看函数名相同就可以推断；混用上述规则可能造成双重释放或错误 FFI 调用。

另一个校正：现代 `UnreliableNoDelay` 是 **5（NoNagle 1 | NoDelay 4）**，不是 Legacy SendType 1。文档描述的是在建连未完成或现有队列预计延迟过大时**拒绝这次提交**并返回 Ignored，不能据此声称已接受的旧消息一定会在 200ms 后被自动撤回。本轮也相应校正了锚点原型文件开头的设计用语。

## 边界契约

- 固定绑定 12 个导出，绑定本身不调用接口 accessor。必须由未来的连接管理器在本进程已经成功初始化 SDK 后显式 open；模块不会初始化 Steam、创建监听／P2P 连接或注册 JS 回调。
- open 创建该边界自己的 poll group；连接句柄仍由未来连接管理器创建、接受、关闭和管理生命周期。
- attach 先校验当前大厅成员和句柄预算（最多 10 个），再通过原生 GetConnectionInfo 核对实际 Steam 身份。不是只信任调用方的 handle → peer 映射。
- 每次 send / receive 再检查成员资格。接收同时核对原生 connection handle、原生消息身份、lane 与可靠性，不能用包正文宣称的 Steam ID 认证。
- 不解码或记录 IP、端口、连接描述和原生 debug 字符串。diagnostics 仅含有界计数。

| 类型 | lane | 优先级 | 现代发送标志 |
| --- | --- | --- | --- |
| 控制／输入 | 0 | 0，最高 | ReliableNoNagle = 9 |
| 完整锚点 | 1 | 1 | ReliableNoNagle = 9 |
| 可替换快照 | 2 | 2，最低 | UnreliableNoDelay = 5 |

优先级仅约束**同一连接的发送安排**。跨 lane 没有接收顺序保证；只有同 lane 的可靠消息保证顺序。它也不代替多客机共享上行的总限流／公平安排。不能仅凭测试夹具读到了优先级数组就声称真实网络延迟已下降。

## 内存与返回值

Windows x64 布局经过固定 SDK 头文件的 C++ static_assert：Identity 136 字节、Message 216 字节、ConnectionInfo 696 字节。消息 data@0、size@8、connection@12、identity@16、flags@196、lane@208。同时静态验证 v012 SendMessages 的 C++ 方法类型和实际发送标志。

发送：

1. 单条原生消息 1–512KiB；不接受任意 flags，只按三种固定类型选择。
2. 用 SDK AllocateMessage 分配；把数据复制到 SDK 内存，只改允许的 connection／flags／lane，不把 JS Buffer 指针交给后台线程长期持有，也不安装 JS free 回调。
3. 准备失败在交给 SendMessages 前释放一次。
4. 调用 v012 SendMessages 后即转移所有权。成功／Ignored／LimitExceeded／其他失败均**不能再释放一次**。
5. 若 FFI 异常使所有权不确定，隔离边界并禁止继续分配重试；不猜测“指针应该还归我”而双重释放。此异常路径最多留下当前一次不确定分配，不能宣称任意 native 故障下都绝无泄漏。
6. 正消息号保留为精确十进制字符串；snapshot 的 -41 是 dropped，-25 是 backpressure；可靠消息的 -41 不能被当成可丢弃控制消息。其他结果明确返回错误，不悄悄排队重发。

接收：每轮最多 16 条，每条复制前验证长度和来源。复制后在 finally 释放整个原生批次，包括被丢弃条目和发生解码异常后尚未处理的条目。输出是独立 Buffer，不是 native view；既避免释放后读取，也不依赖 Electron 对 external ArrayBuffer 的支持。异常批次不部分上交，重复 native 指针不重复释放。

close 只将自己跟踪的句柄移出 poll group 并销毁该 group，不擅自关闭连接管理器的连接；调用方必须继续完成所拥有连接的关闭。已关闭或异常隔离的实例不自动复活。

## 已执行的验证

### 常规回归

`node --test scripts/check-steam-sockets-v012.mjs`：15/15 通过。覆盖固定 ABI 绑定、三个 lane／flags、精确大消息号、发送负结果所有权、512KiB 边界、成员撤销、原生身份不匹配、坏长度／lane／flags、异常批次释放、计数损坏／重复指针、清理与隔离。

该文件已进入 `npm run steam:check`。旧九客机带宽骤降门禁保持不变，未删去或 skip。最终完整套件 **83 项，82 通过、1 失败**，唯一失败仍为九客机带宽剧降断线。结果见 `artifacts/steam-sockets-v012-progress.json` 和 `artifacts/steam-sockets-v012-suite-final.log`；输入队列的 1,470 个断言仍实际执行。

### 真正经过 C++／Koffi 边界的离线测试

`npm run steam:check:sockets-native` 是显式 Windows x64 检查，要求已经安装 MSVC x64 Build Tools。它从固定提交下载参考头文件，用本机编译器编译 `scripts/fixtures/steam-sockets-v012-shim.cpp`，输出在唯一 artifacts 临时目录，不修改游戏安装包。

它不是 JS 假装有 native 指针：夹具真实 malloc／new 消息和负载，真实填写头文件结构体，在发送负结果、接收丢弃和解码异常路径真实 poison／free 内存。测试在调用 open/send 前必须通过夹具专用 marker，不能误把真实 Steam DLL 当作夹具执行。

最新结果：**815 个断言通过，14 次消息释放，最终原生消息分配存活数 0**。原生夹具内发送 7 次；这是离线本机函数调用，不是网络消息。

另外对**实际附带的 Steam DLL 仅绑定 12 个固定导出**，没有调用 accessor、初始化、联网发送／接收或会话查询。因此 `steamSdkInitialized: false`、`steamNativeSends: 0`、`steamNativeReceives: 0`，不能将这一步写作“Steam 实网原生通道已通”。证据：`artifacts/steam-sockets-native-latest.json`，含固定头文件 URL／SHA、夹具和边界源码 SHA。

## 仍未完成的实际集成

下一关键步骤是连接生命周期管理：Sockets 监听／ConnectP2P／Accept、身份和大厅范围校验、回调指针线程／退出生命周期、有限事件队列、关闭／刷新／重连。不能只把已有 Legacy remote ID 当作 Sockets handle。

之后还须补齐协议协商、明确的新 wire 标识、当前连接 nonce、锚点 ACK／恢复、跨 lane 的比赛切换顺序、原生或应用分片的完整性和过期预算、超大状态可靠回退，以及依据实际 native lane 指标的共享上行发送安排。Legacy 队列诊断依旧不能作为这些 native 发送额度。

最终必须重新通过带宽骤降／丢包／断流／动作 FIFO／重连门禁、真实游戏流程和两账号跨网桌面验证。**本轮没有降低真实网络延迟的测量证据，当前目标继续进行中。**

## 资料

- Valve API 与 lane 规则：<https://partner.steamgames.com/doc/api/ISteamNetworkingSockets>
- Valve 发送标志：<https://partner.steamgames.com/doc/api/steamnetworkingtypes>
- 固定参考头文件（第三方 SDK 镜像）：<https://github.com/rlabrecque/SteamworksSDK/tree/494c2d680b9e47bbc369496b57568f44ef2f6796/public/steam>
- 较新 v013 对照（仅用于发现版本差异）：<https://github.com/rlabrecque/SteamworksSDK/tree/df2baabf574a738ef1ea90a7e89339107fc0a279/public/steam>
