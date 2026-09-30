# 普通输入慢帧：数据隔离与历史基线分段（2026-09-26）

## 结论与边界

本轮**没有新的生产性能收益**，没有第三次浏览器性能测量，也没有恢复edge-demand重试候选。完成的是：定位两次诊断启动失败、补齐测试数据隔离和启动前检查、从已保存的真实基线探针中分割普通输入慢帧。优化总目标仍未完成。

## 为什么前两次没能进入战斗

- 归档浏览器的ships.json有263项，deployment-costs.json有185项；hammerhead的id、DESTROYER类型及10DP均存在。
- 当前工作区两份Node端生成JSON均为空对象，SHA256均为e3566b3a06430868d71e9287dfd6c6c520a3da027aabea01951d407ee131dc2f。
- server/lan-server.mjs从实际Node导入的ships.json构造aiHullIds；两队各10个hammerhead因此被validOptions正确拒绝。第一次失败快照漏了错误正文，第二次已记录原始“房间规则无效”。这不是性能采样，更不是候选回归数据。
- 历史资源清单SHA为21f2717ea19f0ab8be942701288b640e375f5bc2f29557333468683a48ceb172；本次检查时当前清单为2ddd1de5b82b86c0906c95d63066fe550e50d9e0d86542b9623c1acb49bd3185，且hammerhead_base.png在当前清单和public文件树中均不存在。
- 没有将旧JSON/资源写回生产，没有修改其他任务的内容迁移，也没有放宽服务器校验。组内drift=[]的旧四臂实验不因此失效。

## 已实现的测试修复

`scripts/lib/multiplayer-fixture-source.mjs`提供：

1. 显式、只读的四项共享JSON加载钩子。必须在导入relay/harness前安装；逐项验证唯一性、SHA256和JSON语法，只影响指定文件，不替换其它Node模块。一个进程一个所有者，释放幂等，模块缓存不被偷偷清理。
2. 检查实际Node模块与有效源字节，捕捉“先导入、后安装钩子”的缓存错配；比较Node与冻结浏览器的JSON哈希。
3. 检查夹具舰体、目标纹理的清单登记和文件存在性，并可验证已记录的资源清单SHA。拒绝目录逃逸。
4. 主无头脚本在创建临时服务器、Vite和Chromium前输出fixture-sources.json并拒绝不兼容输入。该检查不是完整资产审计，不能单独证明所有特效/纹理等价。

`scripts/check-multiplayer-fixture-source.mjs`还用实际esbuild依赖图验证四项共享JSON清单，避免服务端增加JSON导入后无声漏检。

## 真实Node验证

`check-isolated-options.mjs`只启动localhost临时服务器和两个WebSocket客户端：

- 同源归档Node JSON下，原来的2玩家+20 AI、两队各10个hammerhead、3200DP options被接受。
- 再提交不存在的舰体，服务器仍报错，原options不变。
- 清理完成；四份工作区JSON的前后字节未变；未启动战斗、浏览器或可见窗口。
- 首次短测遗漏hello.instance而失败，保留isolated-options-failed-hello.json；补上协议要求后只定向重测此场景。
- 实际主脚本的资源预检验证约962ms内按预期退出1：共享JSON已全部匹配，但历史资源不齐；没有进入[multiplayer]阶段或启动浏览器。第一次验证命令的Windows --import使用了盘符而非file URL，原错误日志保留，修正URL后仅重测预检入口。

因此只修复了JSON一致性，**没有声称历史视觉工作负载已可复现**。不会用缺图回退、其它纹理或新数据包替代历史资源后，继续拿结果给旧候选翻案。

## 复用已完成的历史基线数据

来源是`artifacts/lan-post-block-timeline-20260926/restore-stage-diagnosis/1-current/`，不是edge-demand候选。输入文件SHA、逐事件结果保存在`historical-baseline-normal-input-summary.json`。原记录errors/failures为空、cleanupCompleted=true。

40个普通输入全部唯一对应实际draw和frame.start，缺失0。按同一事件拆分，不减独立分位数，不把rAF参数当回调开始时间，不把嵌套world与ships耗时相加。

| 真实事件 | 输入到提交 | 回调前等待 | 回调内工作 | 其中apply | 其中舰船字段恢复/定义校验 |
|---|---:|---:|---:|---:|---:|
| 最慢，index36 | 19.185ms | 7.140ms | 12.045ms | 7.565ms | 5.295ms |
| 次慢，index37 | 18.405ms | 0.130ms | 18.275ms | 11.530ms | 9.080ms |
| 该组P95，index30 | 16.915ms | 12.890ms | 4.025ms | 0.010ms | 无恢复 |

这里第三条的等待窗口与收包处理交叠7.350ms，但交叠不是因果证明。前两条支持“恢复路径存在尾部成本”，不能扩大为“普通P95全部是恢复”或“GPU忙造成等待”。这些都是带探针的墙钟阶段时间，不是纯CPU时间或输入到光子。

进一步统计同一普通阶段的全部599个帧回调：apply P95为7.160ms，render P95为4.975ms，完整回调P95为10.960ms。46次舰船恢复中，字段恢复/定义校验P50为6.105ms、P95为8.270ms。见`historical-baseline-normal-window.json`。各项分位数独立，不相加。

### 对下一步的影响

- 优先研究默认LAN中舰船状态与定义恢复的结构性成本，而不是继续调整rAF时钟、增加draw次数或靠提高输入包数挤过门槛。
- 更早CPU采样已指向unpackDisplay、assertDataField和validateDisplayDefinition；本次提供普通输入/帧窗口的真实分段，不提供被否决候选的因果解释。
- 不能按对象地址跳过可写定义校验，不能复活已否决的标量helper/shape缓存/fragment interning；v2仍需解决发送侧完整成本与接收器可写兼容，不能因接收侧快而默认开启。
- 新的生产候选验收需要完整、相互匹配的源码、Node目录和资产工作负载。当前内容迁移中的空目录及缺失旧纹理不满足旧夹具；需明确建立新基线或提供已存证的完整旧夹具，不能混跑。

## 验证及交付状态

- 集中一次：10项数据隔离合同+5项输入分段合同，共15/15通过，0跳过；改动lint通过。
- 两个真实WebSocket客户端的合法/非法options检查通过；实际harness启动前拦截通过。二者均不是浏览器性能/画面验收。
- 完整typecheck已执行一次，退出2，共52项错误，位于本轮未改的NativeExperienceAudio、NativeSceneAudio、DroneLaunchers、FlareSystems、NativeWeaponSystems、ContentValidation、DroneSystem和DesignModel。保留typecheck.log，未擅自修复其它任务代码或重复全套检查。
- LanBattle.tsx、protocol.ts与此前回退基线SHA一致，RealtimeSendPolicy和默认Worker/v2开关未改；edge-demand的final-state.json已补齐，仍rejected。
- 无子代理、桌面输入、原版安装修改、暂存、提交、推送、打包或发布。所有本轮验证进程已结束。
