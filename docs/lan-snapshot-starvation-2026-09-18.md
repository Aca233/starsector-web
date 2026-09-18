# 联机快照饥饿修复（2026-09-18）

## 问题和范围

用户要求先解决联机问题，本轮优先修复“房主继续模拟，但玩家收不到后续状态 / 卡在同步中”。不把这个缺陷与百舰算力不足混为一谈。

旧版 host.worker 在每次补步后，仅当 accumulator + 本次执行耗时小于 33.33 ms 才发布快照。稳定的批量调度也可能永远不满足这个条件：每 100 ms 调用一次、每步 10 ms、每次约 6 步，物理仍能接近 60 Hz 推进，却会一直饿死显示和服务器的同步屏障。

初始 tick 0 在加载阶段生成，可能尚未进入可上传状态；重新同步也要求大于服务器旧 tick 的新状态，不能用旧缓存假装同步完成。

## 修复

- SnapshotPolicy.hostSnapshotDue：保留正常的物理优先策略；同步需要新状态时优先提供，普通补步延迟达到 max(500 ms, 当前快照间隔) 后提供一次发布机会。
- 仍在完整补步批次结束后采集，不发送批次中途世界；截止时间在实际采集/编码完成后重新计时。
- host.worker 复用既有 start / presence(false) 消息，合并开场和重新同步请求。不新增线协议，不放宽服务器 syncId、minTick、freshness 校验。
- 请求保留到确实产生新 tick 快照为止；同 tick 不重复发送，已有快照未消费时不积累大包。
- 500 ms 是下一次回调的发布机会，不是网络延迟上限。调度暂停、上行拥塞仍可能延迟交付。
- 物理 dt、AI、伤害、舰船数量、插值/运动预测、每分钟两次的过载恢复预算均不改变。真正持续过载仍会失败。

## 直接执行 Worker 调度逻辑的可控对照

通过 stdin / 内存 esbuild 模块执行变更前后相同 step 和消息处理代码，只替换可控时钟、模拟成本、快照采集和消息环境；这不是完整游戏/网络验收。

- 批量调度 16 秒：两版都推进 959 tick，无 recovery/error；旧版只有 tick 0 一份快照，修复版共 28 份（27 份后续状态）。说明不存在“必须降低物理速度才能恢复状态”的必要性。
- 常规调度 10 秒：两版都推进 599 tick；快照 200 / 201 份，新版多一份开场及时同步状态。
- 35 ms/步持续过载：两版都恰好恢复 2 次，然后在 tick 46 报错停止；没有用放宽恢复条件换取假成功。
- 保持一份快照未消费并连续请求同步：不新增待发大包；消费后产生大于旧 tick 的新快照，不把缓存当新状态。

证据：artifacts/lan-snapshot-starvation-source.json、lan-snapshot-starvation-scheduler.json、lan-snapshot-starvation-scheduler-log.txt。

## 构建

- 当前工作区 typecheck、lint 通过。
- 生产构建：artifacts/lan-snapshot-starvation-preview，build 2026-09-18T02:47:55.152Z，host.worker-DbS4xmVB.js。
- 对照构建：artifacts/lan-navigation-bounds-preview，build 2026-09-18T02:42:12.625Z，host.worker-8mIHKiEq.js。
- 两份均冻结同一 src 依赖图，主线程与 Worker 的 ?raw 加载都正确处理；差异仅本轮两处网络源文件及构建 ID。两份都包含已接受的避障小优化，不能把其收益算到本修复上。
- 原 dist 和 3005 没有被替换或重启。正常构建仍提示既有的大 chunk 警告。

真实双端结果另追加于下方；可控时钟对照不能代替持续实际联机验收。


## 生产路径复现与第一版双端对照

- 两个独立 Edge context、1600×1000，真实房间/Worker/WebSocket/渲染器，固定种子 1584042333，2 真人守护者 + 30 锤头，初始全部部署。
- 通过内存路由，仅把 Worker 的 4 ms 计时器唤醒间隔改为 100 ms，模拟批量回调；不修改物理 dt、模拟代码和网络延迟。不能把它写成真实跨机/Steam 丢包验证。
- **旧版真实复现了误判中止**：服务器最后收到 tick 276，随后报“计算主机超过 12 秒未更新”；房主独立遥测已经推进到 tick 996、倍率 0.99483×，无 Worker recovery/error。客机反复请求 minTick=277 的新同步，收不到帧。这不是房主停止计算。
- 第一版修复：同类场景观察约 25 秒，49 快照，收到 tick 1446，推进 0.99866×，双方 loaded/connected，0 Worker recovery/error、0 pageerror。
- 第一版未注入调度的 32 舰场景约 45 秒，287 快照、tick 2651，推进 1.00065×；刷新前后等待 controls-ready 并取得画布焦点，权威 throttle=1 / 松开后 0，输入序号确认推进。0 recovery/error/pageerror。
- 第一版百舰场景初始 100 舰全部部署，产生 5 快照、完成双方同步；但在 tick 55 经两次恢复后仍因真实过载停止，最近一次快照 tick 43。计算成本超过 60 Hz 预算，不能将其算为百舰性能通过。

首次脚本有两组在实际开战前超时，未运行战斗，不纳入运行时验证。脚本加入开战按钮稳定等待后重新通过实际按钮启动；原失败记录保留，不为未定位的 UI 故障额外修改代码。AI 编成通过既有 options 协议设置，不能声称整个编队编辑界面验收。

证据：artifacts/lan-snapshot-starvation-live.json、-live-log.txt、-batch-live.json、-batch-live-log.txt。

## 最终版本：重同步不能绕过快照预算

进一步限制同步优先请求：仍需满足当前快照间隔，不能让频繁重同步请求绕过 2/5/10/20 Hz 的采集预算。500 ms 最迟发布机会与单包背压保持不变。

- 新增 24,014 项 deadline / 重复 tick / 各档同步频率对照通过。
- 重新执行完整 Worker 调度逻辑对照：批量 959 tick 时旧版 1 帧、新版 28 帧；正常 599 tick 时 200/201 帧；持续过载两版仍在 tick 46、两次恢复后失败。
- 未消费的快照期间重复请求不堆积；消费后给出新的 tick。2 Hz 预算下每 20 ms 请求同步，后续实际帧间隔仍不低于 500 ms。
- 最终 build：2026-09-18T02:58:26.768Z，artifacts/lan-snapshot-starvation-final-preview，host.worker-CwpKVj8O.js。typecheck、lint、隔离构建通过。

证据：artifacts/lan-snapshot-starvation-budget.json、-scheduler-final.json、-scheduler-final-log.txt、-final-build-log.txt。最终生产联机结果另列下方，不用上一版成功结果代替最终版本验证。


## 最终生产构建双端结果

固定种子 / 同一编队，真实点击准备和开始；两次 32 舰场景都额外验证刷新前后 W 按下与释放，等服务器新 syncId、客户端 controls-ready 和画布焦点后操作。

| 场景 | 采样结果 | 恢复 / 错误 | 结论 |
| --- | --- | --- | --- |
| 32 舰，100 ms 批量调度，约 25 秒 | 43 快照，tick 6→1386，0.97036× | 2 次真实过载恢复，0 Worker error，0 pageerror | 不再饿死同步；恢复后两端仍 loaded/connected，刷新前后操控确认通过。但不能称这个压力场景无过载或始终 1× |
| 32 舰，正常调度，约 30 秒 | 227 快照，tick 1→1764，1.00106×；末段 HUD 约 56 FPS / 11 Hz / 1.00× | 0 恢复 / 错误 / pageerror | 本次正常双端与刷新重连回归通过，不是长时稳定性认证 |
| 100 舰，正常调度 | 初始 100 舰全部部署；5 快照，最后服务器 tick 67；房主继续到 tick 85 | 2 次恢复后真实过载失败，末诊断 simulationMs≈26.23；0 pageerror | 新状态与同步已经产生，但百舰实时性能仍未通过 |

两次 32 舰均确认刷新前/后：权威 throttle=1、存在 keys=1 的客机输入及推进的 ack；释放后 throttle=0。双方在操控核对结束仍为 running。性能倍率仅用采样窗口内同一快照列表首尾，不混用之后刷新/解码采样的时点。后续自然战斗损失不等于降低初始编队规模。

最终证据：artifacts/lan-snapshot-starvation-final-live.json、-final-live-log.txt。中间及失败记录均保留，没有用一次成功覆盖失败。

## 交付与未完成项

- 最终工作区两处网络源文件与验证候选一致；未改服务端验证、物理步长、AI 规则、快照播放/预测或恢复次数。
- 本轮临时 Vite、随机端口 LAN 服务和验证浏览器已退出，没有新增常驻入口；3005 与原 dist 未覆盖。未创建测试文件/运行器，未执行素材 hash/size 人工审计。
- 已修复可复现的“计算仍在推进却长期不下发状态，最终误报超时”缺陷。不能把这个结论扩大为解决所有联机卡顿、百舰算力过载或真实跨网/Steam 稳定性。
- 用户要求先处理联机问题；后续优先定位真实过载与同步成本，不继续分散进行无直接联机收益的 AI 微优化。总目标保持 active。
