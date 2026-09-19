# Steam Sockets v012 连接生命周期（2026-09-19，实验路径，未启用）

## 当前结论

用户的桌面 Steam 联机问题是高延迟后**断开连接**，不是已确认的进程闪退。本轮完成实验 Sockets 路径的连接生命周期管理与实际 C++ ABI／回调验证，**没有修好默认通道的共享上行骤降失败，也没有进行真实双账户 Steam 联机验证**。

默认 SteamGateway 未导入本模块或锚点原型。桌面主进程、桌面后台、Steam launcher 的 esbuild 依赖图分别为 5、27、25 个输入文件，均不含三个实验模块。未创建或发布 v4；冻结 v3 的 338,243,922 字节 ZIP 和 SHA256 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482` 原样保留。

## 实现范围

`server/steam/sockets-lifecycle-v012.mjs`：

- 显式初始化前提：不调用 Steam 初始化，不替换全局 SDK 回调。固定绑定 10 个生命周期函数；房主创建自己的监听，客机仅连接大厅 owner。
- 创建监听／连接时原子传入两项原生配置：连接状态回调（201、Ptr=5）和正 int64 userdata（40、Int64=2）。创建函数返回前到达的回调也可接收。
- 同一个 memory runtime 只注册一个进程生命周期回调槽；只保存当前 manager，不保留已关闭房间。关闭房间**不 unregister**，避免原生队列中的晚到回调跳转到已释放 trampoline。原生创建／清理所有权不确定或回调解码失败会隔离该槽，拒绝反复重开。
- 原始回调只复制标量信息，按最多 128 个 handle 合并，不调用 SDK、不派发应用事件、不保留原生指针、不跨 FFI 抛异常。
- `poll` 把回调当作提示，用当前 `GetConnectionInfo` 重查 Steam 身份、userdata、监听、状态和认证／加密标志。不能因为过期终止回调而关掉当前正常连接。
- 每次连接有独立本地 lease；不可变 ticket 包含 handle、lease、remote、scope。旧 ticket 不能发送／关闭新尝试。这是**本地代际保护，不是远端 wire nonce 或应用协议认证**。
- 最多九个房主对端，拒绝非成员和重复连接，不替换当前正常连接。每次 send／receive 重新核对成员和房间 guard。
- 未变状态每 250ms 审计；回调变更或超时边界强制重查。建连超时仍严格为 `elapsed > 8000ms`，先检查当前 Connected，再判断超时；未放宽保护。
- 已失去 native tag 所有权时只调用发送边界的本地 `forget`，不对外来复用句柄调用原生 detach／close。自己的连接关闭使用固定 reason/debug、`linger=false`。
- 回调溢出时关闭自己的 listener，由 SDK 的 CloseListenSocket 契约覆盖没有进入 JS 有界队列的挂起连接。
- 修复清理过程中才发现 ownershipUncertain、之后错误文本又被 notice overflow 覆盖的漏洞：最终关闭结果及隔离依据最新所有权状态，不依赖某个错误字符串。

## 离线原生验证

运行 `npm run steam:check:sockets-native`。只编译本地测试 DLL，绝不链接、初始化或调用实际 Steam 网络。用 Koffi 向该 DLL 执行真正的 native 分配、结构体读取、回调与线程调用；真实安装的 Steam DLL 仅绑定符号，accessor、open、connect、send、receive、callback registration 均不调用。

固定 SDK v1.63 提交：`494c2d680b9e47bbc369496b57568f44ef2f6796`。每次重新读取固定提交的头文件并记录散列。不能使用 v013 的 SendMessages 签名／失败所有权规则。

新增 `scripts/fixtures/steam-sockets-lifecycle-v012-shim.h`：

- 编译时验证 Callback 712B（handle@0、info@8、oldState@704）、Info 696B（userdata@136、listener@144、state@176、reason@180、flags@440）、ConfigValue 16B（value@0、type@4、union@8），以及状态、认证标志、配置枚举和八个 C++ 生命周期方法／回调类型。
- 配置在 native 侧按真实 SDK 类型解码。覆盖 listener/Connect 返回前的回调、accept、ready、收发、重连、旧房间回调、复用句柄、8 秒边界和回调溢出清理。
- 原生线程实际回调 JS 五次，包含只由 worker 发出的有效 Connected 通知，以及旧事件／关闭后的晚到事件。原生 helper 立即返回，JS 让出事件循环等待完成；不能在阻塞 JS 的同步 FFI 函数中 join 该线程。
- 回调返回后立即毒化其栈内存；消息拷贝后也毒化／释放。检测原始回调内任何原生 SDK 重入调用。

本轮最后一次结果：

| 检查 | 结果 |
| --- | --- |
| 生命周期单元测试 | 19 / 19 |
| 发送边界单元测试（含 forget） | 16 / 16 |
| C++ native 计数断言 | 884 通过 |
| native 回调 / worker 回调 | 154 / 5 |
| 配置过的回调 trampoline | 1，跨房间复用 |
| 原始回调内 SDK 调用 | 0 |
| native fixture 发送 / 消息释放 | 8 / 16 |
| 最终消息分配 / listener / connection / worker | 全部 0 |
| 实际 Steam DLL 绑定 | 20 个不同导出，22 次绑定；无实际网络调用 |
| 完整 `steam:check` | 103 项：102 通过、1 失败、0 跳过 |
| 输入队列 | 同次套件中 1470 个断言通过 |
| lint / typecheck | 均退出 0 |

仍失败的发布门槛：九客机、300ms RTT、共享 FIFO 上行，虚拟 12 秒从 8Mbps 降到 256Kbps；客机在 **20.168 秒**以 `1013 / Steam link stalled` 断开，房主在 20.328 秒清理。保留原测试、断言和 8 秒保护。上述 native fixture 不模拟真实 Valve 线路，也没有证明跨 lane 优先级能解决房主全局带宽拥塞。

## 证据与后续

- `artifacts/steam-sockets-lifecycle-progress.json`：当前源码／日志散列、suite 结果、原生结果和发布包隔离检查的快照。
- `artifacts/steam-sockets-native-latest.json`：原生最近一次结果；其中 output 指向独立不可混淆的编译目录及 result.json。
- `artifacts/steam-sockets-lifecycle-suite.log`：完整失败日志，不隐藏失败。
- 之前的 `steam-sockets-v012-progress.json` 和对应文档保留为历史结果，不把它们旧计数冒充本轮结果。

下一步仍须实现应用握手（build／capability／lobby scope／远端 nonce）、可靠控制与锚点帧协议、有限重组／过期处理、共享上行调度及原生指标、明确降级策略和 native-backed 网关回归。跨 lane 不保证交付顺序，NoDelay 只证明拒绝部分新提交，不证明已接受消息会自动撤回。在这些门槛及真实双端测试完成前，不默认启用、不打包新发布版、不宣称“现在可以稳定联机”。
