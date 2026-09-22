# Phase41：同一完成tick被本地跳过后的恢复

## 本次启用的修复
真正的缺陷是将“尝试交给I/O”误当成“该tick已经成功准入”：directLastTick在尝试时前进；skipped只释放信用。如果世界恰好停在该tick，没有新物理步，完整状态永远不再发送。这是本地发布状态机问题，不是Steam RTT，也不是客机少算了物理。

现在本地跳过会重新开放最新完成状态的资格，并以约16.67ms的拒绝重试间隔避免持续背压时忙循环。正常成功发送无额外限频，没有调低60Hz目标。只使用原来的单槽，不缓存旧快照队列，不推进额外物理步。

每次尝试拥有该私有端口epoch内单调attempt，普通MessagePort和共享完成日志均核对tick+attempt。因此旧同tick回执、共享日志旧记录、重复/非法回执都不能释放新尝试。同步二进制、JSON回退、可选异步编码均覆盖。共享日志从52变为68字节/端口，仍固定有界。attempt不进入外部LAN/Steam状态包，不改变网络协议或远端ACK含义。

生产文件仅：src/network/host.worker.ts、AuthorityIoBridge.mjs、AuthorityLocalCompletion.mjs与其声明。默认实际路径启用，无新实验开关。Phase38固定恢复保留；Phase39纹理候选及Phase40两个采集候选均未启用。

## 可复現证据
1. 修改前提取真实host.worker函数的回归失败：第一次tick1返回skipped后，即使等待20ms仍只有一份发送，预期应两份。原失败保存为before-regression.log。
2. 修改后103项联机/桥/编码/Steam传输模型等回归通过。新增测试包括旧共享记录、延迟重复回执、200次持续背压、身份安全整数边界、并发seqlock、最新tick替代、异步和JSON。最后加强的专门回归46项通过（与103项有重叠，不能加总成149个独立测试）。完整app TypeScript通过，oxlint通过。首轮固定日志尺寸测试仍期望52而报失败；按新的明确合同改为精确68，并新增旧尺寸拒绝断言，原失败保留。
3. 实际5人、22艘舰、每人独立无头Chromium和desktop helper，两阶段稳态夹具**故意跳过tick61第一次本地准入**，不延长任何等待/12秒恢复保护：
   - 共享完成路径：tick61 attempt62 skipped，attempt63 sent；确认sharedCredit=true。
   - 纯MessagePort路径：同样attempt62 skipped→63 sent；确认sharedCredit=false。
   - 两次均通过持续开火、预测/弹体飞行、800ms房主主线程阻塞隔离（中间450ms仍发12份且客机输入ACK推进）、同局重连、无游戏错误。
   - 所有完整检查点及整个区间有效输入变化完全一致。源图和Node依赖无漂移。

## 不夸大收益
两次物理约59.78Hz，客机完整状态约41–44Hz，仍不是稳定60Hz。该修复消除了已复現的“同tick跳过后无重试”稳定性问题，不是低Hz总吞吐问题的解决，也不能断言Phase39那一次历史暂停失败必然同因。没有测真实跨机Steam/n2n RTT。最终终止时强制发布/屏障及旧声音消费策略没有扩大或重做，不能声称解决所有断线/声音问题。

未重新构建、安装、提交、推送或发布；本地dist仍是原先构建，源码验证不表示已安装游戏更新。不碰生涯，不使用桌面。

证据：artifacts/network-stream-20260922/phase41/real-summary.json、completion-path-trajectories.json、validation-summary.json、forced-skip-5/same-tick-retry.json、forced-skip-port-5/same-tick-retry.json。

## 继续方向
Phase39的900物理步只有652次推进回调/652份状态是生产成本证据。下一步仍需对房主simulation/capture/encode做能通过整体门槛的结构性改造；不重启已否决候选、不扩大信用掩盖瓶颈、不把本轮可靠性修复说成Hz提升。
