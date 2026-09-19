# Steam 断线：原生诊断与可丢弃快照原型（2026-09-19，未发布）

## 结论先行

这是对“桌面 Steam 联机延迟很大，然后断开连接”的继续排查，**不是已修好公告，也不是 v4 发布**。

- 当前默认网关仍使用 `steamworks.js 0.4.0` 的 Legacy Reliable（枚举 2），原有 8 秒确认保护不变。
- 当前共享主机上行候选的九客机／300ms RTT／8Mbps 突降 256Kbps 门禁仍失败：约 20.168 秒客机 `1013 / Steam link stalled`。这是合成可靠 FIFO 模型，不能证明它就是用户当时两人对局的根因。
- 本轮增加只读原生诊断、修正诊断运行时打包遗漏、强化未启用的锚点差分原型，并把它们接入持久化回归。没有登录 Steam、邀请朋友、修改防火墙／代理或启动实网对局。
- 本机默认已安装版日志在检查时最后修改于北京时间 2026-09-19 00:53:31，仅 1,578 字节，没有 `[steam-transport]` 事件或断线指标。因此不能从这份旧日志还原本次断线。未把原日志中的身份字段复制进测试报告。

## 已接入默认源码：只读会话指标

实现：`server/steam/session-metrics.mjs`；接入：`server/steam/gateway.mjs`。

只固定绑定两个函数，不提供任意函数名、DLL 路径、原生写操作或前端原生执行接口：

```cpp
void *SteamAPI_SteamNetworking_v006();
bool SteamAPI_ISteamNetworking_GetP2PSessionState(void *self, uint64_t remote, void *state);
```

仅 Windows x64、仅本进程成功初始化真实 Steam SDK 后启用；测试注入 client 不会自动加载或查询真实 SDK。DLL 选择与已有桌面浮层一致：优先可执行文件旁的 `steam_api64.dll`，否则随 Steam addon 附带的 win64 DLL。绑定失败只禁用诊断，不能影响连接或发送。

Win64 `P2PSessionState_t` 固定 20 字节布局：

| 偏移 | 字段 | 处理 |
| --- | --- | --- |
| 0–3 | active、connecting、error、relay 四个 uint8 | 只输出状态／数值 |
| 4 | int32 queuedBytes | 非负才保留；负数为 null，不伪装成空队列 |
| 8 | int32 queuedPackets | 同上 |
| 12 | uint32 remoteIP | 不输出、不缓存、不记录 |
| 16 | uint16 remotePort | 不输出、不缓存、不记录 |
| 18–19 | padding | 不输出 |

主机只采样仍属于当前大厅的已连接客机，客机只采样当前房主；最多 10 个远端、每 1,000ms 最多一轮，并在成员离开、连接关闭、离开房间时清理。错误、缺少 session、未采样都返回有界原因，不输出异常正文。只复制白名单字段，注入 reader 返回的额外地址／身份字段也不会进入日志。

`transport.nativeSessions` 表示诊断能力和上次／峰值采样耗时；主机 `peers[].nativeSession`、客机 `nativeHostSession` 表示缓存读数及样本年龄。现有 15 秒 `[steam-transport]` 样本和关闭日志包含这些值。

原来 callback 7 的 SDK `error` 被忽略；现在 `native-link-failed` 保留 0–255 范围内的原始错误码和缓存的会话指标，之后才清理连接。SDK 回调内不再次原生查询。主机关闭理由明确为原生 P2P 失败，不再把所有原生失败都写成链路超时。无关远端的回调不制造本局失败事件。

**这些计数只用于诊断。** Legacy 文档没有清楚保证 queuedBytes 区分“尚未发送”和“已发但未确认”，所以它不是可用发送额度、可靠拥塞窗口或纯线路 RTT。巨大读数、读取失败均不得改变发送类型、预算或超时。离线绑定成功也不代表实网采样开销已验收。

## 打包修正与验证边界

`scripts/package-steam-metrics-runtime.mjs` 显式复制 Koffi JS loader 和 `@koromix/koffi-win32-x64` 原生 addon。

本轮复查发现：只复制进 Electron 的 staging/backend 还不够，electron-builder 的宽泛 FileSet 会过滤根 `node_modules`。因此新增对应的 **explicit extraResources FileSets** 和 `afterPack` 路径检查，禁止解析落回开发仓库或桌面父进程 ASAR。Steam 便携打包也检查这两个依赖及真实 `koffi.node` 文件。

`npm run steam:check:runtime` 为明确的 Windows x64 离线烟测：实际复制到 staging，再按与 Electron 共用的 FileSets 复制到独立 `app/resources/backend`；子 Node 进程确认依赖解析全部来自该目录，并绑定随包 Steam DLL 的固定导出。已运行成功，报告 `sdkInitialized: false`、`sessionQueries: 0`。

**这不是一次完整 electron-builder 桌面包验收**，也没有调用 live session reader；没有制作或交付新游戏包。

## 原生 API 调查：不能直接改 Legacy NoDelay

安装的 `steamworks.js` 类型声明注明：Legacy Unreliable 最大 1,200 字节；UnreliableNoDelay 主要表示建连前不缓冲。现有 Steam packet codec 使用约 32KiB 分片，直接把可靠发送模式 2 改成 1 会违反大小限制，且不能保证原生队列按消息年龄丢弃旧状态。

现代 `ISteamNetworkingSockets` 的 `k_nSteamNetworkingSend_UnreliableNoDelay` 是不同 API 的位标志，包含 NoNagle / NoDelay 语义，文档描述可丢弃因排队而延迟的消息，并以 `k_EResultIgnored` 报告部分丢弃情形。不能把它的常量当 Legacy 枚举；真正实现前仍须固定头文件／结构体版本、回调生命周期和所有权，并验证网络行为。

现有 DLL 的 PE 导出表包含 Messages v002、Sockets v012、Utils v004 及 Legacy v006。`artifacts/steam-native-network-exports.json` 是只读导出表证据，不是初始化或连接成功证据。

## 未启用：可靠锚点 + 可替换差分

原型：`server/steam/anchored-snapshots.mjs`，**SteamGateway 不导入它，后端依赖图不包含它**。

现有 v1 链式差分依赖上一条已发送状态；直接丢一条会使下一条失去基准。原型改为：可靠发送完整锚点，后续差分始终对已确认锚点计算，不依赖中间快照。最初一个锚点的 ACK 尚在返回途中时，允许先对该唯一 pending 锚点计算。

- 复用生产差分的 JSON 树预算、深度、大小和 SHA-256 校验；还原完整状态，不丢字段、不改物理。
- 发送端最多保留 confirmed + 一个 pending 锚点；接收端保留两个锚点，不缓存全部世界历史。
- 原型 5 秒提供一次新锚点，已有 pending 时不再增加；只有精确匹配 pending token 的 ACK 才切换基准。
- 接收按 uint32 wrap-aware token 单调显示；旧状态／重复锚点不回退画面或刷新有效状态存活时间；丢失基准明确返回 needsAnchor。
- prepare 不改变锚点状态；实际发送接受后同步 commit。WeakSet 记录选择的归属、锚点 revision 阻止 ACK 后重新提交旧选择；重复提交、跨 sender、reset 前旧选择无效，且不强引用历史选择。
- 接收端拒绝带有效哈希但属于另一场比赛的新锚点／完整状态，必须先显式 reset。坏哈希或复用锚点 token 不改变原基准。
- 超大／过深状态返回 unsupported；跨场景返回 reset-required，均不得悄悄进入不可靠发送。

### 仍缺失，不能用于真实房间

1. 原生适配器、能力协商、旧版兼容与独立协议标识。当前复用 v1 envelope 是测试内部表示，**不得混入 v1 链式接收路径**。
2. connection nonce / generation 的线协议认证与生命周期管理。局部 reset 计数不是旧连接包的认证；调用者必须先丢弃旧 nonce，尤其 ACK 不能仅凭 token 跨重连复用。
3. 可靠锚点／控制消息的顺序、ACK 丢失重试、过期恢复、重连与比赛切换集成。
4. 有界 MTU 分片／重组、半包丢失／过期、native NoDelay 的拒绝反馈、发送节奏和共享上行控制。
5. 超大状态的可靠回退与返回实时通道的时序；不能复活旧不可靠帧。
6. 原生队列、带宽骤降、两账号跨网络及真实桌面回归。

当前丢包测试丢弃／重排的是 **SWSP 完整解码之后的逻辑快照**。不是原生包或分片丢失测试，也不能证明它已经解决默认路径的带宽突降断线。

## 本轮回归和发布状态

- 新增／强化独立回归：原生诊断 13 项、锚点原型 10 项，23/23 通过。
- 锚点测试含 1,200 条变化状态，确定性约 25% 完整逻辑消息丢弃和重排；所有实际交付状态精确匹配 JSON，基准缓存有界。
- `npm run steam:check`：68 项，67 通过、1 失败。唯一失败仍为九客机带宽剧降门禁，没有删除、skip 或放宽它。
- 输入队列 1,470 个断言通过，现在作为同一 `node --test` 的独立文件测试执行，不再因前面的 `&&` 短路被省略。
- `npm run typecheck`、`npm run lint` 通过。
- Windows 实际复制运行时的导出绑定烟测通过，初始化／session 查询均为 0。
- 上一轮三个本地浏览器的模拟共享通道游戏验证属于当时源码；本轮没有重跑该游戏流程，不能套用其旧 hash 声称本轮全路径验收。

日志：`artifacts/steam-native-anchor-suite.log`、`steam-native-anchor-typecheck.log`、`steam-native-anchor-lint.log`、`steam-native-anchor-runtime.log`；本轮汇总及文件哈希：`artifacts/steam-native-anchor-progress.json`。

原 v3 ZIP 未改动，重新核对 SHA-256 为 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482`。目标保持进行中；不能把已写源码／离线通过说成“现在双方已经能稳定联机”。

## API 依据

- Valve Legacy networking：<https://partner.steamgames.com/doc/api/ISteamNetworking>
- Valve Sockets：<https://partner.steamgames.com/doc/api/ISteamNetworkingSockets>
- Valve networking types / send flags：<https://partner.steamgames.com/doc/api/steamnetworkingtypes>
- 实际已安装声明：`node_modules/steamworks.js/client.d.ts`、`callbacks.d.ts`
- 结构体与 flat ABI 参考头文件（第三方 SDK 镜像，不冒充 Valve 官方仓库）：<https://github.com/rlabrecque/SteamworksSDK/blob/main/public/steam/isteamnetworking.h>、<https://github.com/rlabrecque/SteamworksSDK/blob/main/public/steam/steam_api_flat.h>
