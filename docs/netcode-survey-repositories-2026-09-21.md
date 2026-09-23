# 联机方案调研：36 个 GitHub 仓库索引（2026-09-21）

与 [主报告](netcode-survey-2026-09-21.md) 配套。不是安装清单，也不是全部压测过。

## 证据等级

- **A**：读取具体网络源码、接口或实现文档；入口见主报告附录。
- **A-L**：README + 实际许可证深核，未深读其网络实现。
- **B**：README + 官方 API 初筛，不能证明内部算法或性能。
- 许可是初步筛查，不替代完整法律/第三方依赖审计；API 的 NOASSERTION 不等于没有许可。
- 最后 push 不等于发布质量；12 个重点仓库另固定 commit，其他是获取时分支快照。
- 原始副本与失败记录在本机忽略目录 `artifacts/netcode-survey-20260921/`。

## 传输与浏览器连接

| 仓库 | 证据 / 许可 | 能解决什么 | 对本项目的用途 | 主要限制 |
|---|---|---|---|---|
| [colyseus/colyseus](https://github.com/colyseus/colyseus) | A；MIT | Node/TS 房间与权威状态框架 | 房间基础设施参考，不建议整体迁移 | 已有复杂房间、回执、Steam 桥；换框架不等于修复 CPU/拥塞 |
| [geckosio/geckos.io](https://github.com/geckosio/geckos.io) | A；BSD-3-Clause | Node 与浏览器的 WebRTC 实时通道 | 浏览器方向接近现有 TS/Node；先做 adapter 探针 | reliable:true 是有限次重发；关键事务另审确认；有原生依赖及 TURN 运维 |
| [johanhelsing/matchbox](https://github.com/johanhelsing/matchbox) | B；MIT OR Apache-2.0 | WebRTC P2P 与信令；可配 GGRS | 连接发现与浏览器 P2P 对照 | 信令不等于 TURN 中转；全互联不能直接替代单权威房间 |
| [lance-gg/lance](https://github.com/lance-gg/lance) | B；Apache-2.0 | Node 同步、插值和输入重演 | 学习 JS 预测/重演接口 | API 最后 push 为 2024-05；不等于失效，但维护/依赖需验证 |
| [lsalzman/enet](https://github.com/lsalzman/enet) | A；MIT | 轻量可靠 UDP、独立通道、分片 | 非 Steam 自管桌面服的备选 | 需自己处理认证、加密、连接发现/中转；不是实体复制系统 |
| [lucaspoffo/renet](https://github.com/lucaspoffo/renet) | A；MIT OR Apache-2.0 | 可靠有序/无序、不可靠通道及资源预算 | 参考队列、分片、内存边界 | Rust；不可靠队列不是自动按实体 latest-only |
| [mas-bandwidth/netcode](https://github.com/mas-bandwidth/netcode) | B；BSD-3-Clause | 带安全连接建立的 UDP 协议 | 自建传输时参考认证与连接令牌 | 传递不可靠无序包，不是完整实体同步，也不是浏览器库 |
| [mas-bandwidth/reliable](https://github.com/mas-bandwidth/reliable) | B；BSD-3-Clause | UDP 包级序号与接收确认 | 学习 ACK/统计与包生命周期 | 包收到不代表操作执行或 renderer 消费 |
| [mas-bandwidth/yojimbo](https://github.com/mas-bandwidth/yojimbo) | B；BSD-3-Clause | netcode + reliable + 消息/块与通道 | 学习可靠事件和时效状态分离 | C++ 集成；连接双方配置须一致；不替代上层游戏协议 |
| [paullouisageneau/libdatachannel](https://github.com/paullouisageneau/libdatachannel) | B；MPL-2.0 | 原生 WebRTC DataChannel/WebSocket | 原生桥接浏览器的备选 | 原生依赖、ICE/STUN/TURN 运维；须遵守 MPL/第三方许可 |
| [pion/webrtc](https://github.com/pion/webrtc) | B；MIT | Go WebRTC 协议栈 | 单设 Go 中转/专服时考虑 | 引入另一服务语言；不自动提升现有 JS 模拟/编码吞吐 |
| [skywind3000/kcp](https://github.com/skywind3000/kcp) | A；MIT | 快速 ARQ 可靠传输 | 可靠通道候选，不是卡顿万能药 | rcv_nxt 保持按序交付；仍有队头阻塞与重传成本；宣传非本项目实测 |
| [timetocode/nengi](https://github.com/timetocode/nengi) | A；Apache-2.0 | 显式实体协议、字段比较、创建/更新/删除、预测 API | 借鉴 JS 网络实体边界 | 仍有比较/扫描成本；README 容量不是本项目基准；核对版本 |
| [ValveSoftware/GameNetworkingSockets](https://github.com/ValveSoftware/GameNetworkingSockets) | A；BSD-3-Clause | UDP 上可靠/不可靠消息、分片、加密、多 lane | 桌面与 Steam 路径首选重点；完善现有适配 | 原生 C++/C；浏览器不能直接链接；开源库不自动附带 SDR 服务 |

## 状态复制与引擎框架

| 仓库 | 证据 / 许可 | 能解决什么 | 对本项目的用途 | 主要限制 |
|---|---|---|---|---|
| [cBournhonesque/lightyear](https://github.com/cBournhonesque/lightyear) | A；MIT OR Apache-2.0 | 复制/预测/插值、可靠性通道、包优先级 | 重点学习分层与限额调度 | Rust/Bevy，不能直接替换 TS 引擎 |
| [colyseus/schema](https://github.com/colyseus/schema) | A；MIT | 字段变更登记、二进制增量与共享/view 编码 | 独立 NetworkView 小规模 A/B 首选之一 | 不能把所有模拟对象硬改 Schema；精度、基准、删除/重连与版本要审计 |
| [FirstGearGames/FishNet](https://github.com/FirstGearGames/FishNet) | A-L；FishNet 自定义授权 | Unity 网络框架 | 功能与架构对照 | 对同类网络产品使用有排除条款；不是无条件宽松组件 |
| [MirrorNetworking/Mirror](https://github.com/MirrorNetworking/Mirror) | A；MIT | Unity 复制、兴趣管理、快照插值 | 有界 buffer、时轴修正、抖动测试 | Unity/C#；项目已有插值，不能重复实施后宣称传输已修复 |
| [naia-lib/naia](https://github.com/naia-lib/naia) | B；MIT OR Apache-2.0（README） | Rust UDP/浏览器 WebRTC 的组件复制 | typed protocol、变化登记、room scope | 语言/实体结构迁移成本；不是可直接 import 的 TS 库 |
| [Unity-Technologies/com.unity.netcode.gameobjects](https://github.com/Unity-Technologies/com.unity.netcode.gameobjects) | A-L；Unity Companion License | Unity GameObject/MonoBehaviour 联机 | 概念与功能对照 | 限定 Unity-dependent projects；本轮未审其全套预测能力 |

## 回滚

| 仓库 | 证据 / 许可 | 能解决什么 | 对本项目的用途 | 主要限制 |
|---|---|---|---|---|
| [gschup/ggrs](https://github.com/gschup/ggrs) | B；MIT OR Apache-2.0 | Rust GGPO 风格回滚 | 以后验证确定性模拟时参考 | 全世界确定性和 save/load/replay 成本未解决 |
| [pond3r/ggpo](https://github.com/pond3r/ggpo) | A；MIT | 输入预测、状态保存/加载、回滚重演 | 回滚协议研究 | 需可恢复完整状态和 CPU；当前 P1 呈现快照不满足 |

## 账号、匹配、部署与持久化

| 仓库 | 证据 / 许可 | 能解决什么 | 对本项目的用途 | 主要限制 |
|---|---|---|---|---|
| [clockworklabs/SpacetimeDB](https://github.com/clockworklabs/SpacetimeDB) | A-L；BSL 1.1（实际 LICENSE） | 内存数据库、事务模块和订阅状态 | 持久世界的长期候选，不在本轮落地 | 生产实例/数据库服务有授权条件；事务订阅不等于实时弹体复制 |
| [agones-dev/agones](https://github.com/agones-dev/agones) | B；Apache-2.0 | Kubernetes 专服生命周期/伸缩 | 未来大量专服运维 | 已重定向至 agones-dev/agones；不解决单场战斗同步 |
| [googleforgames/open-match](https://github.com/googleforgames/open-match) | B；Apache-2.0 | 匹配服务编排 | 未来匹配系统 | 不传舰船状态，不修复客机 Hz；目前部署复杂度不合算 |
| [heroiclabs/nakama](https://github.com/heroiclabs/nakama) | B；Apache-2.0 | 账号、社交、匹配、房间与实时服务 | 以后需要账号/匹配/持久化时考虑 | 不自动把 CombatEngine 变成低带宽 60Hz 服务 |

## 实际游戏源码

| 仓库 | 证据 / 许可 | 能解决什么 | 对本项目的用途 | 主要限制 |
|---|---|---|---|---|
| [0ad/0ad](https://github.com/0ad/0ad) | B；精确许可证本轮未核实 | 0 A.D. 旧 GitHub 镜像 | 仅历史索引 | 已归档，官方描述称 2024-08 迁移 Gitea；不等于现项目停止维护 |
| [Anuken/Mindustry](https://github.com/Anuken/Mindustry) | A；GPL-3.0（API） | 实体分块快照、状态分类、team 复用 | 大量实体场景的分类与共享工作 | 隐藏规则、精度和 tick 都不能原样当作远行星号规则 |
| [ddnet/ddnet](https://github.com/ddnet/ddnet) | A；zlib 风格（已读 license.txt） | 实体差分、确认基准、恢复与拆包 | 优先参考丢包下 delta 生命周期 | 不照搬恢复降频/物理精度/角色规则；第三方资源许可另核 |
| [id-Software/Quake-III-Arena](https://github.com/id-Software/Quake-III-Arena) | A；GPL-2.0（API/README） | 实体 baseline/delta、创建删除、快照 | 对象级增量的清晰源码样本 | 历史架构；GPL 不能默认当宽松代码复制；PVS 不等于太空战视野 |
| [luanti-org/luanti](https://github.com/luanti-org/luanti) | B；LGPL-2.1+（README） | 可 mod 的持久世界客户端/服务端引擎 | 以后区域同步与内容版本参考 | 仅初筛，未审 MapBlock/对象协议；非当前战斗链路捷径 |
| [OpenRA/OpenRA](https://github.com/OpenRA/OpenRA) | A；GPL-3.0（API/README） | 命令队列、同步校验、锁步推进 | desync 诊断、命令归并、重放 | 客机参与模拟；不适合现阶段把重 AI 战斗改成锁步 |
| [teeworlds/teeworlds](https://github.com/teeworlds/teeworlds) | B；精确许可待核 license.txt | 经典 2D 多人动作游戏 | 对照 DDNet 的同源演进 | 本轮仅 README/元数据，未深审当前网络源码 |
| [ValveSoftware/source-sdk-2013](https://github.com/ValveSoftware/source-sdk-2013) | A；Source 1 SDK License（非商业） | HL2/HL2DM/TF2 游戏代码与延迟补偿 | 理解回溯命中/恢复 | 不是 CS2 或完整 Source 网络引擎；非商业；不能盲搬瞬时射击回溯 |
| [veloren/veloren](https://github.com/veloren/veloren) | B；GPL-3.0（README） | Rust 开放世界多人 RPG | 以后 ECS/区域复制研究入口 | GitHub 是 GitLab 镜像；未审同步源码；非即插即用网络库 |
| [Warzone2100/warzone2100](https://github.com/Warzone2100/warzone2100) | B；GPL-2.0（API） | 开源 RTS 多人项目 | 后续 RTS 网络专项候选 | 本轮未进入同步源码；不从游戏类型猜全部当前协议 |

## 获取时维护状态与源码锚点

| 仓库 | 最后 push（UTC） | archived | 深读源码 commit |
|---|---|---|---|
| [0ad/0ad](https://github.com/0ad/0ad) | 2024-08-17T03:00:37Z | true | 默认分支快照 / 未固定 commit |
| [Anuken/Mindustry](https://github.com/Anuken/Mindustry) | 2026-09-21T05:58:48Z | false | [3a5481351355](https://github.com/Anuken/Mindustry/commit/3a5481351355735bfe1a2e7e48a5baaa81d214d0) |
| [cBournhonesque/lightyear](https://github.com/cBournhonesque/lightyear) | 2026-09-21T01:43:50Z | false | [125f454bf49a](https://github.com/cBournhonesque/lightyear/commit/125f454bf49adf922b245938e33ca3470a82233b) |
| [clockworklabs/SpacetimeDB](https://github.com/clockworklabs/SpacetimeDB) | 2026-09-21T09:37:34Z | false | 默认分支快照 / 未固定 commit |
| [colyseus/colyseus](https://github.com/colyseus/colyseus) | 2026-09-20T06:10:14Z | false | [23f8d9180bce](https://github.com/colyseus/colyseus/commit/23f8d9180bce683fb29b199005bfb00568da4d3f) |
| [colyseus/schema](https://github.com/colyseus/schema) | 2026-09-17T18:11:48Z | false | [67e849f7c590](https://github.com/colyseus/schema/commit/67e849f7c590c9b5af417044e3c0d90b693adc29) |
| [ddnet/ddnet](https://github.com/ddnet/ddnet) | 2026-09-21T10:47:54Z | false | [f78b2663982f](https://github.com/ddnet/ddnet/commit/f78b2663982f8cd76fb6df635782d9c8cd199f12) |
| [FirstGearGames/FishNet](https://github.com/FirstGearGames/FishNet) | 2026-09-02T01:57:25Z | false | 默认分支快照 / 未固定 commit |
| [geckosio/geckos.io](https://github.com/geckosio/geckos.io) | 2026-03-27T13:04:35Z | false | 默认分支快照 / 未固定 commit |
| [agones-dev/agones](https://github.com/agones-dev/agones) | 2026-09-21T03:47:36Z | false | 默认分支快照 / 未固定 commit |
| [googleforgames/open-match](https://github.com/googleforgames/open-match) | 2026-07-12T18:15:57Z | false | 默认分支快照 / 未固定 commit |
| [gschup/ggrs](https://github.com/gschup/ggrs) | 2026-08-25T19:11:31Z | false | 默认分支快照 / 未固定 commit |
| [heroiclabs/nakama](https://github.com/heroiclabs/nakama) | 2026-09-18T19:29:13Z | false | 默认分支快照 / 未固定 commit |
| [id-Software/Quake-III-Arena](https://github.com/id-Software/Quake-III-Arena) | 2024-08-02T00:20:36Z | false | [dbe4ddb10315](https://github.com/id-Software/Quake-III-Arena/commit/dbe4ddb10315479fc00086f08e25d968b4b43c49) |
| [johanhelsing/matchbox](https://github.com/johanhelsing/matchbox) | 2026-06-02T21:10:26Z | false | 默认分支快照 / 未固定 commit |
| [lance-gg/lance](https://github.com/lance-gg/lance) | 2024-05-11T19:16:24Z | false | 默认分支快照 / 未固定 commit |
| [lsalzman/enet](https://github.com/lsalzman/enet) | 2026-06-23T19:17:35Z | false | 默认分支快照 / 未固定 commit |
| [luanti-org/luanti](https://github.com/luanti-org/luanti) | 2026-09-18T13:41:38Z | false | 默认分支快照 / 未固定 commit |
| [lucaspoffo/renet](https://github.com/lucaspoffo/renet) | 2026-06-20T19:23:59Z | false | [2a5080d78d9e](https://github.com/lucaspoffo/renet/commit/2a5080d78d9ea4c3868c3efc80487573906a0eb1) |
| [mas-bandwidth/netcode](https://github.com/mas-bandwidth/netcode) | 2026-09-13T22:27:12Z | false | 默认分支快照 / 未固定 commit |
| [mas-bandwidth/reliable](https://github.com/mas-bandwidth/reliable) | 2026-09-14T00:12:56Z | false | 默认分支快照 / 未固定 commit |
| [mas-bandwidth/yojimbo](https://github.com/mas-bandwidth/yojimbo) | 2026-09-14T00:20:17Z | false | 默认分支快照 / 未固定 commit |
| [MirrorNetworking/Mirror](https://github.com/MirrorNetworking/Mirror) | 2026-09-19T12:17:22Z | false | [c4f3739966e1](https://github.com/MirrorNetworking/Mirror/commit/c4f3739966e151f405be1762d33502794fd034ff) |
| [naia-lib/naia](https://github.com/naia-lib/naia) | 2026-09-19T16:25:50Z | false | 默认分支快照 / 未固定 commit |
| [OpenRA/OpenRA](https://github.com/OpenRA/OpenRA) | 2026-09-14T20:23:46Z | false | [f3ec7f8e1593](https://github.com/OpenRA/OpenRA/commit/f3ec7f8e1593b482f85fd101652deb740c33dee6) |
| [paullouisageneau/libdatachannel](https://github.com/paullouisageneau/libdatachannel) | 2026-09-16T10:29:47Z | false | 默认分支快照 / 未固定 commit |
| [pion/webrtc](https://github.com/pion/webrtc) | 2026-09-20T18:34:16Z | false | 默认分支快照 / 未固定 commit |
| [pond3r/ggpo](https://github.com/pond3r/ggpo) | 2024-06-26T13:59:55Z | false | [7ddadef8546a](https://github.com/pond3r/ggpo/commit/7ddadef8546a7d99ff0b3530c6056bc8ee4b9c0a) |
| [skywind3000/kcp](https://github.com/skywind3000/kcp) | 2026-06-23T06:21:10Z | false | 默认分支快照 / 未固定 commit |
| [teeworlds/teeworlds](https://github.com/teeworlds/teeworlds) | 2025-07-12T18:34:36Z | false | 默认分支快照 / 未固定 commit |
| [timetocode/nengi](https://github.com/timetocode/nengi) | 2026-09-11T22:47:26Z | false | [763ef4b8b938](https://github.com/timetocode/nengi/commit/763ef4b8b93829540da06d9c47d174f014dd47a2) |
| [Unity-Technologies/com.unity.netcode.gameobjects](https://github.com/Unity-Technologies/com.unity.netcode.gameobjects) | 2026-09-18T18:21:04Z | false | 默认分支快照 / 未固定 commit |
| [ValveSoftware/GameNetworkingSockets](https://github.com/ValveSoftware/GameNetworkingSockets) | 2026-08-27T01:04:25Z | false | [a424b7db6494](https://github.com/ValveSoftware/GameNetworkingSockets/commit/a424b7db649438acafb60c99cae6667587c42732) |
| [ValveSoftware/source-sdk-2013](https://github.com/ValveSoftware/source-sdk-2013) | 2026-09-05T01:05:16Z | false | 默认分支快照 / 未固定 commit |
| [veloren/veloren](https://github.com/veloren/veloren) | 2026-09-20T23:19:17Z | false | 默认分支快照 / 未固定 commit |
| [Warzone2100/warzone2100](https://github.com/Warzone2100/warzone2100) | 2026-09-20T15:23:45Z | false | 默认分支快照 / 未固定 commit |
