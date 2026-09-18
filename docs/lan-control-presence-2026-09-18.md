# 联机同步控制权分离（2026-09-18，协议 v22）

## 范围与结论

本轮优先修复同步时真人舰突然由 AI 驾驶的问题，不是百舰性能完成报告。原 v16–21 文档明确采用「同步中的客机 AI 托管」策略；本次是明确调整这一策略，而不是声称旧实现违反其原设计。

旧生产版实际复现：客机保持 WebSocket 连接，主动 resync 后暂缓 sync-ready。服务端 connected=true、loaded=false；Worker 收到 presence.online=false；权威 tick818 客机舰 fireControlMode=AI、throttle=1。在线等待同步与真实断线走了相同的驾驶权路径，UI 也误报为离线。

## 新规则

| 状态 | 控制权 | 输入 |
| --- | --- | --- |
| 已连接，加载/同步未确认 | 真人，MANUAL | 中立；拒绝操作与部署 |
| 已连接，最新帧已确认 | 真人，MANUAL | 接受当前同步轮次的有效输入 |
| 真正断线或离房 | AI | 不接受该玩家输入 |

中立不是冻结世界：舰船仍参与物理、惯性、伤害和已有自动武器组逻辑；不提供无敌或瞬间停车。

实现：

- 服务端 presence 新增 connected，与原 online（控制放行）分离。连接恢复的 hello 成功后立即通知房主，无需等资源 loaded 才撤销 AI。
- connected 必须同时满足属于该房间和 WebSocket 有效；主动离房时 socket 即便仍开着，也必须交给 AI。
- Worker 初始真人舰保持手动；恢复时保留连接/归属，清空按键、开火、鼠标控制和待处理边沿命令。清空动作时推进已丢弃动作的 ID 水位，避免恢复后重放。
- Worker 输入和部署仍仅在 online=true 时开放；同步时不会伪确认新输入。断线→在线同步也会更新驾驶权，不再仅对比 online 后提前返回。
- 房间消息合成 presence 同时传连接状态，含房主席位；界面分别提示「同步中」和「离线 / AI 接管」。
- 协议 21→22，避免旧端将新字段忽略后出现控制策略不一致。继续使用现有版本握手，不兼容旧服务器/页面混连。
- 不改固定物理 dt、AI/伤害规则、恢复次数、SnapshotPlayback 或 MotionPrediction；不减少舰船/特效数量。

正式改动：server/lan-server.mjs、src/network/host.worker.ts、src/network/LanBattle.tsx、src/network/protocol.json，以及联机文档。

## 验证

### 内存状态机

13 项检查通过：初始中立、放行前拒绝、放行后接受与确认、同步立即清按键/动作、同步不伪确认、丢弃动作不重放、新动作恰好一次、陈旧输入中立、真断线 AI、续接时先撤销 AI、非法 offline+ready 不能放行、恢复保持归属、恢复仍请求同步。直接执行候选 Worker 的控制代码及实际 PlayerControls；世界/时钟用受控替身，不将它当作实战性能测试。

### 真实生产双浏览器

候选构建：2026-09-18T05:02:25.154Z，独立临时端口。两真人攻势；真实 UI 建房、加入、应用配装、准备、开始。

- 开局客机暂缓 sync-ready：tick51 双方 MANUAL、throttle=0，客机 loaded=false。
- 在线 resync：tick799 客机 MANUAL、throttle=0；房主正确提示同步中，没有离线提示。
- 旧 syncId 输入/部署在同步中被拒绝；新轮次放行后，旧 syncId 输入仍被拒绝。
- 真断线 tick961：客机 AI、throttle=1。
- 续接 hello 成功但暂缓 loaded，tick994：客机已回 MANUAL、throttle=0。
- 主动离房但 socket 仍 OPEN，tick1368：原舰为 AI。
- 实际 W 按下/释放均在权威快照中观察到 throttle=1/0，服务器输入序号推进：
  - 初始 tick727/766；resync 后 883/920；断线续接后 1069/1108；
  - 房主 Worker 实际调度暂停恢复后 1185/1216；客机刷新后 1304/1337。
- CDP 注入 1.6 秒 Worker 忙等，实际诊断调度间隔 4.53 秒；仅一次 recovered，随后双方重新放行并可操控。
- 最后 running、tick1377，无 pageerror。暂停注入前独立 10.01 秒窗口快照倍率约 0.9957×；这是短时本机两舰验证，不是跨机/Steam/弱网长期保证。

## 大舰队仍不通过

445 文件冻结图；改前/改后图仅四个联机实现文件不同。两套生产构建完成；AI 文件被并行任务移除后，基线构建使用冻结 resolveId 恢复模块解析，没有将旧文件写回工作区。

固定 seed2232494901，两真人守护者，每队 15/49 锤头，battleSize3200、initialDeploymentLimit1600；同机双端，依次运行：

| 构建 | 舰数 | 秒数 | 快照 tick/墙钟倍率 | 最后服务端 tick | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 改前 | 32 | 10.58 | 0.8885 | 564 | 两次恢复后过载结束 |
| 改后 | 32 | 9.55 | 0.8517 | 488 | 两次恢复后过载结束 |
| 改后 | 100 | 1.931 | 0.3711 | 43 | 两次恢复后过载结束 |
| 改前 | 100 | 2.47 | 0.2092 | 31 | 两次恢复后过载结束 |

先前一次改后 32 舰功能试跑同样过载结束（12 秒窗口包含结束后的时间，倍率不可作为有效运行速度对照）。大舰队功能验证因此没有用失败场次冒充通过，而改用两舰独立验证控制链路。

本轮改前/后都失败。32 舰末端平均模拟步约 34.7/21.1ms、采集约 28.6/19.8ms、编码约 23.7/17.6ms，说明真实计算与快照开销仍需处理。单次顺序对照、不同运行长度、共享机器负载，不能证明稳定性能收益或归因差异。此冻结图也不是上一轮尾迹剔除的旧图，不能跨轮直接比较。

下一步应在新的完整冻结依赖图上继续定位房主模拟 / 火控 / 快照热点。不能用放宽保护、少放舰船或改 dt 宣称百舰已通过。

## 检查与证据

- 当前工作区最终 typecheck、lint 通过。早先出现并行 UI 编辑的临时类型错误，后续检查已消失；未改动这些 UI 文件。
- 本轮没有创建项目测试文件/运行器，没有进行素材 hash/size 审计。检查为 stdin / 内存执行；数据和隔离构建位于忽略的 artifacts。
- 未重启、替换或关闭 3005；测试浏览器和独立联机服务已关闭，旧常驻入口未切到 v22。

证据：

- artifacts/lan-control-presence-before.json、-candidate.json
- artifacts/lan-control-presence-baseline-live.json
- artifacts/lan-control-presence-state-machine.json
- artifacts/lan-control-presence-small-live.json
- artifacts/lan-control-presence-live.json（32 舰功能试跑失败记录）
- artifacts/lan-control-presence-comparison.json
