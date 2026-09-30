# LAN 原始二进制 → 呈现所有者：验收（2026-09-25）

## 已完成与边界
已接通可选路径：

`真实 WebSocket / socket I/O Worker → LanConnection 有界头部准入 → 原 ArrayBuffer transfer → 呈现 Worker 内增量还原、完整解码、世界初始化与事件保留 → 本地消费回执 → 服务器 ACK`

生产连接类和实际 `LanPresentationRuntime` 提供该入口，无头场景使用它们验证，而非另外造一份世界/解码器。跨线程传原包和小结果，不传解码后的frame，也不在收到状态后重新编码一份给Worker。

**默认 LanBattle 未认领新入口，仍使用原来的主线程路径；完整生产呈现 Worker 尚未开启。** 本轮没有模拟吞吐、FPS、CPU占用或 input-to-photon 的配对测量，没有新提速百分比，没有GPU模拟。

## 实现合同
### 连接侧
- `claimBinaryState(owner)` 为独占、显式能力，首包binary到达之后不能直接更换owner；返回null保留原路径。
- SWB1仅读取最多1024字节JSON元信息；SLD1仅读固定头部，并对非patch的内层SWB1头部交叉检查。patch的match绑定当前显式owner；最终内层身份由所有者完整decode再次校验。
- **头部通过不是CRC/帧合法证明，更不是消费完成。** ACK所用matchId/seq由主线程自己的准入记录决定；Worker只能完成已发出的本地token。
- 准入按解码后的wire字节数，而不是压缩patch大小计费。沿用state账本最多64条、总计 `2 * maxSnapshotBytes` 的当前代际预算；token、乱序结算、终局等待和timeout仍由原有 `PresentationReceipts` 管理。
- 认领者必须同步defer或明确complete/reject；空回调和返回Promise不再触发默认discard ACK。发送/收到了消息也不能当消费成功。
- reset、重连、前后台、关闭撤销旧能力；投影特性变化也更新owner会话。活动流释放owner时重连取得新的主线程基线，不承诺无缝热切换。
- JSON状态保持既有订阅路径。如果当时存在未消费raw工作，明确重连恢复，而不是越过它继续JSON并静默丢失离散事件；没有待消费工作时重置raw基线，再走原有JSON路径。

### 所有者侧
- `LanBinaryStateIngress` 复用原有完整 `LanDeltaReceiver` / CRC / motion-reference纠正 / `decodeBinaryState`，保持原有两锚点上限。校验外层预算、内层match/seq和投影能力。
- 会话只接受显式控制reset，不能从包自行安装epoch。旧owner/epoch包不解码、不写世界；坏CRC、缺失基线、错误身份或预算使decoder失败关闭并清掉锚点。
- `LanPresentationRuntime.receiveBinaryState` 在同一个realm完成decode、首次世界恢复、播放队列和离散muzzle保留。同步 `onRetained` 是附属声音/输入事件交接点，必须完成后才返回retained；它返回Promise、抛错或导致owner撤销时不能报成功。
- 早于minTick的帧不进入世界，但仍完整验证并保留必要wire anchor，后面的有效delta才能继续还原。没有通过降低频率、精度、实体/效果数量改变游戏结果。
- 主线程得到的只有retain状态、tick、wire大小和解析耗时；没有返回整个frame。本轮没有实现完整音频及输入控制器，因此不把这个回调当成已迁移全部战斗事件。

## 验证
扩展既有 `check-battle-batching-browser.mjs` 的 Offscreen 分支；后台、无头、没有桌面/键鼠事件、没有子代理。

最终 `offscreen/offscreen-result.json`：**passed=true，28项专项，errors=[]**。
- 完整包、普通增量、经过motion-reference预测后完整纠正的增量，其解码frame经相同投影编码的CRC一致。该CRC探针只在测试中使用，不加入生产接收成本。
- 实际loopback WebSocket测试对端、生产 `LanConnection`、socket I/O Worker、实际呈现 Worker 间有6次原包传输；主线程原buffer全部分离，raw阶段未广播解码frame事件。
- 呈现runtime无初始解码世界也能从原始状态bootstrap；首次实际渲染与既有DOM路径像素逐字节对照：**差异0**。仅这1帧，不是完整12场景像素基准，也不是原版截图等价。
- 原包到达、转移、Worker收到或完成retain都不能自动提前ACK。第二/第三状态倒序完成时，仍按seq顺序释放累计信用；计费为完整wire大小而非patch大小。
- reset后旧token、旧owner/epoch数据无效；重新发送锚点恢复；minTick之前的锚点不显示但可支持之后的delta。
- 未协商投影、未协商delta、坏CRC、缺失基线、错误身份/长度、截断头部、跨对局match、相同epoch reset、关闭后使用等失败路径通过。真实Worker也拒绝能通过便宜头部检查的坏CRC。
- JSON无待消费时走旧订阅通道；有待消费raw时不越过，明确重连恢复。没有认领者时binary原路径仍解码；中途认领被拒绝。
- 终局消息等待最后一条消费；最终ACK序列 `[1,2,3,5,10,11]`，被撤销的4未获ACK。
- 空raw回调、返回拒绝Promise的错误owner均不能悄悄ACK，也没有未处理Promise拒绝。
- 退出后 residentTextures=0、pendingUploads=0，关闭230个bitmap；已关闭runtime拒绝绘制/应用/输入。

**测试对端是专用fixture WebSocket peer，不是正式relay/authority服务器，也不是完整双端LanBattle。** 不据此报告正式联机端到端速度。

### 检查过程
1. 首次专项因测试用了不支持SWF3数值块的旧二进制encoder而失败；保留 `offscreen-initial-failure.json`。改为现有支持该投影的encoder，不修改生产协议容错标准。
2. 随后专项通过；代码审查发现显式消费、JSON混合顺序和能力撤销边界，定向补齐并复查同一场景，最终28项通过。未运行全套像素/性能场景。
3. scoped lint通过；tracked源码 `git diff --check` 通过。
4. 首次 `npm run typecheck` 的唯一失败为并行生涯 `src/campaign/client/CampaignClient.ts:75` 的TS2345，未擅自修改。最终用CompilerHost固定before/candidate非生涯源码及共享读取，**两路诊断均为0，新增诊断0**。这是冻结源码图对照，不把先前失败的全工作区命令标成成功。

## 证据与源码范围
`artifacts/lan-presentation-ingress-20260925/`：
- `before-browser.json`：662个非生涯模块，SHA256 `a8e48433d63fd1acb8b838f0a64b6575fcb46f02130e351f9357337bbccd292d`。
- `current-browser.json`：663模块，仅修改4个既有模块并加入1个模块；其余658个已有模块与基线一致。
- 新增 `src/network/LanBinaryStateIngress.ts`；修改 `BinarySnapshot.mjs` 及声明、`protocol.ts`、`LanPresentationRuntime.ts`。
- 新增测试helper，扩展既有Offscreen浏览器/Worker脚本。
- `source-changes.json` 记录源/测试哈希及无关并行漂移；保留它们，不作为本轮成果或覆盖掉。
- 静态日志、类型对照JSON、专项结果、早期失败/通过快照、`acceptance.json`。

版本0.2.11不变；没有暂存、提交、推送、打包、发布或替换已安装游戏。原版证据与未实机核实项见同日source-notes。

## 启用前剩余工作
- 正式LanBattle主控制器接入新owner；motion/combat/视觉组件/本地主机准入和消费信用仍待同样接通。
- 完成JSON混合的端到端所有权交接、飞行输入/相机/accepted action时序、完整音频/设置、Canvas失败回退。
- 多代际桥接的ready/调度约束：本轮账本是当前代际预算，不是整个浏览器堆的硬上限；撤销token不表示已经transfer的远端消息立即被物理回收。
- 以上全部接入后，再验证真实双端同步/重连和主线程繁忙下的input-to-photon，决定是否默认启用。
