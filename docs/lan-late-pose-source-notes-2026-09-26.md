# LAN 姿态晚采样：源审阅与预注册（2026-09-26）

## 依据与与已否决方案的区别

全帧执行时钟已否决并回退，见`lan-execution-clock-performance-2026-09-26.md`。忙任务后旧rAF stamp会早于已接受的输入；真实MotionPrediction合同验证其无法重放未来输入。但全帧换钟同时改变了SnapshotPlayback恢复节奏，不能由旧结果推定本轮一定改善。

本轮不复活全帧赋值或额外draw：只在现有完整恢复和synchronize之后，采样一次同realm的performance.now作为poseNow。调用renderPose与drawPlayback的预测效果使用同一个poseNow，fireActive的250ms新鲜度也对齐它。其它仍用rAF now。

这是Web显示调度，不修改原版物理、移动规则、火控规则或UI布局，不作原版实机等价声明。仅后台无头。

## 时钟与权限边界（编码前固定）

| 环节/来源 | 时间 | 约束 |
|---|---|---|
| LanBattle.frame、SnapshotPlayback.sample/applyEndpoints | 原rAF now | 保留队列/缓冲/500ms重置/最后两端点及所有校验 |
| synchronize、HUD、fps/frame gap、lastFrame | 原rAF now | 不改变重同步/权限和HUD时序 |
| 恢复后renderPose | poseNow，恢复且同步后采样一次 | motion/combat/projectile/turret及本舰MotionPrediction原有安全门槛不变 |
| camera follow | 原sample.alpha和rAF dt | 保留50ms视觉dt上限，位于新姿态后、effects前 |
| drawPlayback预测飞行/本地开火 | 与姿态相同poseNow | 不单独二次取时；fireActive250ms使用poseNow，不放宽阈值 |
| 确认contrails/muzzles/particles、renderer.visualTime | 原sample.visualTime/alpha/reset | 不让预测时钟推进确认事件或权威combatTime |
| DOM输入/网络收包 | 原performance.now | 不改频率/seq/ACK/重放预算 |
| remote/Worker分支 | 原rAF/Worker现状 | 不改变默认开关，不在remote分支加入采样 |

来源：`LanBattle.tsx`的frame/pushControls/synchronize；`LanPresentationRuntime.ts`的applyPlayback/renderPose/drawPlayback；`LanPresentationPipeline.ts`的applyEndpoints/renderPose/renderEffects；`SnapshotPlayback.ts.sample`；`MotionPrediction.ts.render`。后者保留250ms重放上限、500ms过期、50ms平滑dt；碰撞/死亡/失焦/未就绪等仍由原实现控制。恢复阶段的预测基线仍使用原恢复时钟，不去改权威pos/vel/facing。

## 验证与门槛（编码前固定）

- 扩充既有真实LanBattle AST提取合同：apply/sync仍旧stamp；完成恢复后才采样；pose/effects共享晚时钟；camera原alpha/dt；正常/长停顿dt上限；过期fire关闭；隐藏/未就绪/销毁/remote/异常单链；失焦、失权、未launch不绕过原门槛。
- 通过真实Runtime/Pipeline源码提取阶段合同验证now到达预测消费者；sample.visualTime/alpha/reset不被替换。既有真实MotionPrediction合同继续证明输入重放和权威值不变。
- 完整实现后一次typecheck、改动lint、时钟/测量/post-block合同、MotionPrediction合同，之后一组真实LAN场景，不每改一行重复测试。
- 复用已核验的756文件冻结源图（含52 raw CSS）及三入口编译CSS，只覆盖LanBattle。此后四臂依赖/测试/manifest漂移检查；不宣称验收当前全部UI资源。
- ABBA，2玩家+20AI，seed917，1280×720，D3D11，主线程呈现、Worker/v2=false。每臂20秒（普通10秒+每次DOM输入后忙70ms的10秒）；原固定250ms输入间隔不改变。四臂均含主机800ms实际停顿、ACK推进、同局重连、清理。
- 配对1→2与4→3，**每对都通过**：忙时显示时钟年龄P95至少减少30ms且40%；普通年龄P95回归<=3ms；两阶段control→submit、累计ACK覆盖后draw、frame gap P95各回归<=3ms；发送/控制覆盖>=95%、缺失不得增加；帧数<=基线1.05倍；模拟Hz下降<=5%；全部安全场景通过。
- 每个实际draw都需记录真正renderPose参数；缺失/非法值不填0。时钟年龄不是耗时、网络RTT、输入到光子；即使年龄改善也不能覆盖其它失败。
- 未通过就精确回退本轮生产改动，不放宽门槛、不删样本/择优重跑，不借相位推测翻案。生产回退前先核对候选SHA，保留原飞行键修复及无关任务改动。
