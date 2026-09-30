# LAN 重复同步通知修复结果（2026-09-25）

## 本次交付

修复普通玩家房主 LAN 路径中的桌面桥接批次重置问题。开始于9月24日，验收于9月25日；没有改模拟频率、画质、实体数量、网络信用上限、队列容量或权限。无可见窗口、无提交/推送/打包/发布；未碰生涯工作。

## 根因与改动

服务器在同步尚未完成时可以重发同一 `matchId + syncId + minTick` 的 launch。完整状态/launch 走 primary TCP，运动和回执走另一条 control TCP，二者没有统一到达顺序。迟到的同批次 launch 不代表一次新的同步。

原 `server/desktop-lan-bridge.mjs` 无条件清空 motion/visual/combat 增量基线、bulk 分片重组状态及 control 回退重放缓存。后果包括：

1. 下一包本来合法的运动 delta 因缺基线失败，桥接关闭可选控制通道、退回 primary。
2. 正在传输的完整世界只收到剩余分片，重组被破坏，主连接也可能被错误关闭。
3. 已通过控制通道本地发送、但尚未由权威消费的最终回执被遗忘；可选通道故障后失去原有重放机会。

现在仅对**三个字段均合法且完全相同**的通知保持接收状态；每条通知仍转发给页面。新 match/sync/minTick、缺失或非法字段、welcome/left/ended/roomClosed 仍重置。没有把重复通知当作消费回执，也没有放宽 CRC、基线、epoch、授权或序列校验。

来源/预期对照：`docs/lan-launch-idempotence-source-notes-2026-09-24.md`。

## 验证与证据

目录：`artifacts/lan-launch-idempotence-20260924/`。

- `npm run typecheck`：通过（`typecheck.log`）。
- 三个改动代码文件 scoped oxlint：通过（`lint.log`）。
- 既有真实 relay + DesktopLanBridge + WebSocket 场景：**51/51**（`scenarios.log`）。包含3–5客户端、旧epoch、坏包、重连、终局、分片信用等原有检查，以及本次运动连续性/分片重组/重置边界检查。
- 随后补强的一项回执丢失夹具，仅定向复查：**1/1**及该文件 lint 通过（`ack-dispatch-loss.log`、`ack-dispatch-loss-lint.log`）。运行时补丁在集中验收后未再修改；未重复跑全套或游戏基准。
- 运动回归保留一份 full 基线，重复3次 launch 后仍精确解出后续 delta；发送统计仍是1 full + 2 delta，没有通过强制发送新 full 掩盖问题。
- 分片回归在真实第一片写完成回调处暂停，重复 launch 后原数据精确 deepEqual 还原；transport 分片回执不增加 renderer 消费计数。
- 回执回归确实经真实 WebSocket 写入后，测试在可选连接权威分发前丢弃3条消息；控制连接关闭后由 primary 重放，只有原有真实消费确认能释放对应额度，重复输入不能重复执行动作。

### 旧实现反证，不覆盖脏工作树

只在测试构建时将 bridge 模块替换为本轮开始前冻结内容，其它模块与相同测试不变；构建排除了 campaign 输入。

| 回归 | 冻结旧桥接 | 修复后 |
| --- | --- | --- |
| 同批次重复后下一运动delta | 等待motion4超时，失败 | 精确还原，原控制连接存活 |
| 分片中重复后完成原世界 | 等待完整重组超时，失败 | 全部字段精确相同，真实应用回执才释放信用 |
| 最终真实回执丢失后的重放 | 等待ACK/sync/input超时，失败 | primary重放恢复，恰好确认/执行一次 |

前两项见 `before-regressions.log`；第三项见 `before-ack-dispatch-loss.log`。这三项分别对旧实现失败、对候选通过，不是给坏包开后门来换通过。

保留夹具不足记录：最初回执测试仅暂停底层socket，随后改为ws.pause也仍能让旧实现通过。原因是ws关闭流程可能冲刷已缓冲的消息，不能把“尚未处理”假定成“永久丢失”。最终改成明确的权威分发前故障注入，并断言3条实际写入被丢弃，才得到旧实现的预期失败。早期日志 `before-regressions.log`（2失败/1通过）和 `before-ack-refined.log`（1通过）均未删除；不把它们算作修复成功的反证。

## 尚未证明的内容

- 旧0.2.11用户日志未记录足够的launch到达顺序，不能把所有 `whole-state-stalled` 或Steam重连都归因于本缺陷。
- 本轮没有模拟/渲染/输入到光子性能测量，也没有Valve/n2n公网重跑；不声称4Hz已经恢复60Hz或P95下降某个百分比。
- 运动/回执路径适用于已协商可选控制通道的普通LAN桌面连接；分片复现覆盖既有显式启用的分层路线，未把它改为默认开启。
- GPU计算、LAN多核默认策略、显示定义表开关均未改变。既有Steam幂等修复保留不动。

下一轮仍应以新构建的实际双端日志核对控制通道持续存活、真实消费Hz和输入确认尾延迟；不能以本机传输正确性替代真实线路收益。
