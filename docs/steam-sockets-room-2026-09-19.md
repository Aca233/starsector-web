# Steam Sockets 房间/浏览器适配进展（2026-09-19）

## 状态：有实质进展，未达到发布条件

用户问题仍是桌面 Steam 联机高延迟后断线。**未证实真实两账号跨网络问题已解决**；没有启动/登录 Steam，没有邀请玩家，也没有重新打包或覆盖冻结 v3。

默认仍使用 legacy reliable P2P。新增的 Sockets 房间实现仅可通过测试注入的 `socketRoomFactory` 接入；没有环境变量、HTTP 参数或默认入口开启它。网关默认依赖图不含任何 `sockets-*` / `anchored-snapshots` 实验模块。

## 本轮实现

### 实际网关、实际 relay 与浏览器之间的适配

- 新增 `server/steam/sockets-room.mjs`，组合已存在的生命周期所有者、SWS2 session、共享准入器、wire 重组预算；不加载原生 DLL、不初始化 SDK。
- 网关为大厅固定选择 `sw_transport`：`legacy-p2p` 或 `sockets-v012-app1`。缺失字段的旧房间仍按 legacy 处理；未知版本或未安装实验工厂的客机明确拒绝新房间，不静默降级。
- 房主本机浏览器继续直接连接现有 relay，远端 peer 在 native 身份/成员/lease 校验及三步 wire 握手完成之后才调用 `acceptTransport`。身份与房间 scope 由 lifecycle ticket 提供，不信任游戏消息中的声明。
- 新路径不读取 legacy 包，也不让 legacy 的 accept/failure 回调破坏正在使用的新会话。
- 客机浏览器在 wire ready 之前最多暂存 32 条 / 64KiB 消息，重连替换之前先撤销旧 ticket；旧原生通知、旧包和旧 WebSocket 回调不能影响新浏览器。
- 控制信封区分 app / close / closeAck。relay 的踢出码/版本错误码通过可靠控制通道传到浏览器；关闭发起方等待实际远端 ACK，最多 2s 后释放所有权。SDK 本地接受不等于已经交付。
- relay 心跳只由匹配已准入 ping 的实际远端 pong 驱动；本地 `.ping()` 或本地 native send 成功不能更新 relay liveness。
- 对浏览器状态写入单独保留一笔在途 send callback，忙时丢弃新的可替换 presentation，不堆积已解码世界状态。慢写超过固定 8s 关闭。控制不受状态跳帧影响；总浏览器 buffered bytes + 下一条消息不超过现有 2×快照上限。
- 按 relay 的 room/match/ended/left 信息追踪当前可展示对局。结束/换局之后抵达的旧状态不得恢复旧游戏画面。

### 新接线过程中补齐的两处行为

1. session 新增 `suspendStates()`：取消 latest 和未发送的旧状态；若可靠 anchor 已提交首片，仍完成剩余分片/ACK，避免对局结束反而制造接收端 8s 重组超时。已开始但可丢弃的 snapshot 可以中止。
2. 原 legacy 输入分类函数现在共享给新适配器。session 只合并**相邻、尚未提交首片、同 match/sync scope、递增 seq、没有 action**的移动输入。技能、其他控制、ping/pong、scope 变化及已发送首片都是顺序边界。技能动作不被丢弃，也没有放宽队列安全上限。

## 验证

### JavaScript 集成

新增 `scripts/check-steam-sockets-room.mjs`，**18/18 通过**：

- 真正的 SteamGateway + createLanServer relay 代码完成 hello/create/join、准备/启动/加载、完整 state、end。
- 版本与传输选择、legacy 隔离、pre-ready 限额、畸形输入/二进制拒绝。
- 重连 resume token、旧 ticket/旧回调隔离、单页面限制。
- 慢前端丢弃新状态、写回调失败/8s 超时、远端心跳真实性。
- close code/reason、成员移除、房主迁移、原生故障、房间 teardown。
- 迟到旧状态隔离、可靠分片中途结束对局、发送背压时移动合并且动作保持顺序。

测试只将 `http.Server.listen/close` 替换为内存行为，relay 的协议/房间处理代码没有替换；**没有实际绑定网络端口**。生命周期和线路在该文件中为内存模拟，没有模拟瓶颈、Steam 拥塞控制或路由。因此不能将这 18 项用作带宽骤降性能证明。

### 原生 C++ 房间适配测试

新增 `scripts/check-steam-sockets-native-room.mjs`，接入已有 opt-in native runner：

- 房主是实际编译的 C++ 测试 DLL + lifecycle/status/IO + room/session/pacer，客机与浏览器为 JS 模拟。
- 测试 pre-ready browser hello、relay control、match、分片 anchor/ACK、snapshot、native 背压恢复、真正经过 native receive 的 pong、ended、带 ACK 的关闭。
- 新增房间阶段 17 次 fixture send / 10 次 fixture receive 投递。
- 全 native runner **1153 个计数断言通过**；总共 43 次 fixture SendMessages、71 次消息释放。
- 结束时 live native messages、listener、connection、poll-group attachment、wire retained bytes 均为 0；无 callback 内 native 重入。
- 真实安装的 Steam DLL 仅绑定 **21 个不同导出 / 23 次绑定**；SDK initialization / 实际 native send / 实际 native receive 均为 **0**。
- pinned v1.63 headers 经 SHA256 校验，使用 `--verified-headers` 显式离线模式。开始/结束校验所有 native 测试源文件散列，未边测边改。
- native 结果：`artifacts/steam-sockets-native-FGWugr/result.json`。

### 全量与静态检查

- `npm run steam:check`：**170 项，169 pass，1 fail，0 skip**。
- 同次运行的输入队列独立断言：**1470 通过**。
- lint / typecheck：均退出 **0**。
- 唯一失败仍是未被改变的 legacy 默认路径 gate：9 guests、300ms RTT、共享上行在虚拟 12s 从 8Mbps 降到 256Kbps；虚拟 20.168s 客机 `1013 / Steam link stalled`。没有删除或跳过该测试，也没有延长 8s 保护。
- 默认入口依赖图仍为 desktop main 5 / electron service 28 / Steam launcher 26 项，实验模块 0。

日志、退出码与 source hashes 汇总于 `artifacts/steam-sockets-adapter-progress.json`。历史 pacing/session 文档中的旧计数仅代表当时版本，不能替代本次结果。

## 未完成 / 下一关键路径

1. 将新的**真实 wire、session 和 room 调度**放入共享瓶颈测试：分别建模 SDK 待发、已经进入 OS/router FIFO 的包、RTT、丢包/重传/乱序、带宽骤降、混合 RTT。不能用当前总是返回零 pending 的内存 fixture 冒充拥塞测试。
2. 当前准入器仅限制 SDK pending，仍不能证明外部共享 FIFO 不会积压到超过 8s。需要完整的端到端反馈/共享在途控制设计和验证。
3. 房主多客机 CPU/内存成本仍需优化/测量；当前 adapter 的 session 私有 encoder 可能重复准备同一广播状态。不要为了降低成本削减游戏数据或演算内容。
4. 新路径 gate 通过后，才可考虑默认启用及打包；真实两账号跨网络 Steam 游戏验证仍缺失，最终稳定性不能由离线模型替代。

冻结 v3 ZIP 保持 338243922 字节，SHA256 `da6b94bc89c3f128045349e3e0217a781a43ad4287864dd2d8c41207ea4a3482`。本轮未新建发布包。目标继续保持 active。
