# LAN 同步通知幂等：来源与验收边界（2026-09-24）

## 范围与依据

本切片只修改 Web 联机桌面桥接，不改原版玩法、UI、AI、物理步长、网络协议字段或控制权限。原版单机不提供此同步/回执机制，故本项不是原版规则还原；无需通过改变原版行为来优化。不开可见窗口，不提交、打包或发布未完成生涯。

原实现证据：

- `server/lan-server.mjs:511–520,1350–1353`：同一未完成同步批次可重发相同 `matchId/syncId/minTick` 的 launch。
- `src/network/LanBattle.tsx:570–588`：相同 syncId 不重复 freeze；重复 launch 仍由页面正常接收。
- `server/desktop-lan-bridge.mjs:130–137`：原桥接对每个 launch 无条件清空 chunk/visual/motion/combat 接收器及 replay 回执缓存。
- `server/MotionWire.mjs`：运动增量引用同一 match/sync 内前一包基线；缺失基线必须拒绝，桥接异常会 `stopControl()`，不能为性能绕过 CRC/基线校验。
- `server/steam/gateway.mjs:51–52,130–133,529–535`：Steam 已有批次幂等；本轮不重复改 Steam。

## 预期与差异

主连接按序，但可选控制连接独立，较早发出的重复 launch 可以迟于该批次控制帧到达。相同合法 matchId+syncId+minTick 不代表新批次，不应清空其基线、分片状态或待重放回执。新的批次、welcome/left/ended/roomClosed 仍清空；非法/不完整 launch 不能借幂等判断保留已建立的可信基线。所有 launch 仍向页面转发。

不扩容、不加队列/重试计时器，不提前 ACK，不减少安全校验。保留实际控制连接故障时的 primary 回退，以及新批次旧包拒收。

## 验证计划

扩展既有 `scripts/check-lan-control-lane.mjs` 与 `scripts/check-layered-motion.mjs` 的真实 relay + DesktopLanBridge + WebSocket 场景：

1. 建立实际运动压缩基线→重复同批次 launch→下一包必须是真实 delta、能精确还原、控制连接保持存活。
2. 重复 launch 不丢待重放的真实消费确认；控制连接故障后回退仍释放其对应旧账目，不伪造其它 credit。
3. 新 syncId、改变 minTick、生命周期结束仍重置；旧 epoch 不被新基线接纳；验证缺基线 delta 仍触发既有安全回退。
4. 同一新增回归用例对冻结旧桥接应失败，对修改后应通过。旧实现通过模块导入路径替换运行，不覆盖当前工作树。

完成一个补丁后集中 typecheck、改动文件 lint 与该现有场景。这里是控制通道正确性和无谓回退修复，不声称模拟FPS、WAN吞吐或输入P95已经提升。
