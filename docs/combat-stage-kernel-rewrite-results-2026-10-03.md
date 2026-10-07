# 阶段数据通路重写验收 — 2026-10-03

## 交付边界

已实作只读决策阶段、实体关系/位置预测数据平面、标量位置候选评估、按需精确舰队影响、开火批成员证明和备用对象查询树的惰性构建。不是修改HUD/限速/AI频率来制造收益。**尚未达到重型60Hz，也没有完成根舰/模块所有职责的最终独立化。**

本轮由主代理独立完成；不操作桌面，不改UI、生涯或发布内容，不暂存/提交/推送/打包。原版目标0.98a-RC8，C:/starsector-core及C:/decompiled仍缺失。原版源码/实机/UI等价未验证；来源对照见同日期source-notes。

## 最后同窗ABBA（不能与之前绝对时间拼接）

既有2玩家+20AI、三种实际设计，seed917、standard；22根舰展开为176实体/734挂点；每臂150预热+120计时，全270步。

| 指标 | 旧路径 | 重写路径 | 变化 |
|---|---:|---:|---:|
| 整步 | 44.994ms | 35.384ms | -21.36% |
| fleetAI | 13.858ms | 10.572ms | -23.71% |
| fire-query | 13.218ms | 11.029ms | -16.56% |

原始臂时间：47.604, 37.085, 33.682, 42.384ms。是Node同步权威引擎，不含渲染/网络/等待/浏览器调度，不是FPS或RTT；同机波动存在，不能保证相同比例在用户现场重现。其余未改阶段也有时间变化，不能把全部下降精确归因于单个新内核。

四臂最终完整captureCombat快照与RNG都相等（不是每270步都逐字段对照），最终170实体、90弹丸、双方235/243发射。没有减少单位、武器、查询上限，没有改变step或20Hz采样策略。重写后的平均35.384ms仍大于16.667ms；AI+fire-query仍约21.600ms。

## 实际工作变化，不靠计时推测

- 270次平面、20,520个根舰/模块计划共用其read lease；控制/effects开始前关闭，外部/普通未登记world仍用原逐计划读法。
- 两队实体关系名单每270步仅构建540次，复用4,261次，不再每次模块位置建议重扫全部实体状态。
- 3秒位置预测计算20,337次、复用154,382次，约88.36%请求无需重建相同预测。仅原生向量、只读span复用，不跨帧；自定义clone保留每次回调。
- 原生root标量score5,977次，module23,169次；保留候选、射界、避障建议、诊断值和顺序。不是删除模块防御/旋转/系统AI，通用模块决策仍然存在。
- 舰队距离计算4,103,730→2,824,129（-31.18%）；影响项8,254,667→3,655,999（-55.71%）。未稀疏截断影响，仅未消费的行不计算；原求和/claim/tie次序不变。
- 备选battery行缓存在该270步场景**命中0次**，不把它冒充本次收益来源。
- 实际Native ShipStepBatch记录阶段成员来源，270帧全部通过捕获证明（旧最终默认264帧）。名单中之前owned、稍后退场的飞机仍按其当下dead/phase规则精查；不是取消未知getter/foreign守卫。
- Numeric frame有效时无需提前构建第二个对象acquisition树。必要回退仍用捕获的contacts，不回头取已变化的实时pose。

## 失败与定向修复保留

1. 初次fixtures把最终默认当成显式numeric=true，generic无owner帧被拒绝；仅修正该probe传实际owner，未放宽生产准入。
2. 新弹道缓存的runtime spec校验增加开销，authority-final整步回退约2.08%，开火回退约6.50%。这条代码已完全撤回，AutofireController与本轮source-before hash相等。
3. 去掉缓存后authority-accepted仅0.56%整步改善，AI反而约2.35%回退。未将此版当成根因修复完成。原因是未消掉各计划重复的实体关系/位置预测，且新平面准备/校验仍有成本。补齐共同body/预测平面与真实world绑定，才得到最后同窗结果。

各具体失败后只修相关代码/fixture。最终body-plane只复查同一个重型场景、实际root/module oracle、source/关闭边界，未重新运行已经通过的其它场景。结果和失败日志均保留，不与之前39.76/45.10ms拼接或累计百分比。

## 验证状态

- 项目类型检查和改动文件lint通过，具体日志在artifacts目录。
- `authority-accepted`覆盖既有native scope/getter/custom policy、1536几何、真实阶段顺序/单次提交、两种profile真实Worker与同步在激活/高flux下的逐步快照/RNG。
- 最终body/prediction绑定增量用`authority-body-plane`做聚焦ABBA、真实root/module对象oracle、过期读拒绝/live回退；此前通过的Worker suites未针对这个最后增量重跑，不能冒充最终全部profile覆盖。
- 最后对world descriptor/source-ref守卫再做默认unset普通/registered实际tick、未知getter不调用、关闭回退、自定义clone回调的定向smoke。该小守卫调整发生在计时之后；保留最终源码与独立诊断，不称为对最终守卫版再次精确计时。
- 没有此次新浏览器/联机ACK/跨机/截图验收；之前browser-default-armed回执不是本轮最终源码回执。UI没有改，原版界面比较待核实。

默认仅已有私人、原生、command-only host authority启用；`VITE_COMBAT_STAGE_KERNEL=false`可回到旧数据路径，不改变规则。core/motion失败实验仍关闭。

**后续根因工作仍需要拆清模块建议与实际控制职责、进一步减少开火精查/状态适配链；本次不能叫根治全部高ms。**

## 文件

- `src/engine/ai/DecisionReadPlane.ts`、`TacticalPositioningKernel.ts`及连接的Scene/Phase/Positioning
- `src/engine/ai/NumericalFleetPlanner.ts`
- `src/engine/simulation/ShipStepBatch.ts`、`src/engine/ai/CombatFireFrame.ts`、`NumericAcquisitionFrame.ts`
- `artifacts/combat-stage-kernel-rewrite-20261003/summary.json`、各authority*/result.json、最终default边界日志、source-before/、final-source/、manifest.json
