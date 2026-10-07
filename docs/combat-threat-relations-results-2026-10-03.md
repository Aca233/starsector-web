# 威胁候选关系执行层 — 实施结果（2026-10-03）

## 本块真正解决的工作图
保留所有20根舰、56附属模块的独立威胁预测，每步仍76次，不降到20Hz、不复制母舰结果、不改变target/pressure/claim/firepower。

`WeaponThreatCandidates` 从本帧捕获的数值几何建立保守关系：**同母舰的模块观测者共享候选排除，母舰自己是独立cohort，单成员保留完整kernel**。实际重型场景的56模块形成7个共享cohort。每个模块仍使用自己的中心、半径、速度、预测窗口计算ETA/turn、伤害与护盾方向；关系数组保持原source/mount顺序。

`WeaponThreatFrame.forShip` 已接入真正权威fixedUpdate路径，不是离线DTO。已安装的可选worker结果不建无消费者关系，更大horizon回完整kernel；纯standalone packet默认完整扫描。只在同一捕获帧准备关系，不保存未来决策/跨tick phase。

## 被拒绝的初版与根因纠正
初版把母舰与模块合并一个包围范围。270逐步、预测逐行、RNG和数值边界均通过，但含准备成本的挂点访问约11532.67/步，比原6679.36多约72.7%。母舰的大radius和长vent horizon使模块上界过宽。**没有把总墙钟略降当成功**；失败尝试源码/hash/四臂结果保留在`coarse-family-attempt`。

最终根据这项具体工作失败收紧cohort，重新检查相关authority场景和总工作量，不重复无关数值全套。

## 最终工作次数（120步，同一场景；包括额外准备）
| 每步访问/执行 | 完整原路径 | 最终候选关系 |
|---|---:|---:|
| 来源行访问 | 13177.767 | 4955.375 |
| 挂点行访问 | 6679.358 | 6231.675 |
| 真正角度/ETA精算 | 3733.467 | 3733.467 |

来源总访问减少62.40%，挂点总访问减少6.70%。候选数据准备包含在后列，未漏算新建关系成本。来源分解：准备1213.742 +原/候选kernel3741.633；挂点分解：准备250.717 +kernel5980.958。

计时窗root仍2400次完整kernel，module仍6720次独立候选kernel；准备840个cohort。真正需要的448016次角度精算与完整kernel相同，未把有效威胁剪掉。旧审计的94.925/步是**模块**角度计算；root3638.542/步，总计3733.467/步。已依据原始计数纠正文档归属，不能继续拿94.925当全部observer总量。

## 最终墙钟结果 / 不夸大边界
复用seed917、standard、2玩家+20AI、22根舰/初始176实体/734mounts；150热身+120计时，同窗ABBA，冻结上一块最终默认为基线。
四臂整步分别39.849, 35.989, 33.183, 32.582ms。

| 双臂均值 | 基线 | 最终候选 |
|---|---:|---:|
| 整步墙钟 | 36.216ms | 34.586ms |
| fleetAI+controls+effects | 12.577ms | 11.958ms |

观察均值约下降4.50%，**但四臂漂移很大，最后baseline比最后candidate快；没有证明稳定生产提速，不能把均值全归因本块、更不能与前窗口拼接或承诺60Hz**。没有新增CPU profiler，对根舰真实精算成本不作未经采样的归因。唯一强结论是工作图确实减少无效重复关系访问，而且严格保留预测结果。

## 最终验收证据
- 四臂完整captureCombat终态/RNG一致（170实体/90投射物）。
- 最终270步逐步完整快照/RNG一致；实际计算出的20520个observer rows逐个与冻结**改动前**kernel精确对照，共864067个输出mount/ETA pairs。诊断仅方法body插入，未改prototype身份，未拿诊断耗时当性能。
- false开关270步完整终态/RNG一致，0候选调用；完整路径计数额外120步也检查完整终态一致。
- 初版完成11856次数值对照，其中10899次走候选：组内不同center/velocity/radius/horizon/team、NaN/Infinity、readiness、1e15大坐标、malformed spans、buffer更换、更大horizon等。最终不改这些数值界/公式，只改cohort与singleton回退；最终受影响分组/unknown parent getter/cycle复查通过，并对所有实际observer结果重新对照。
- 原可选worker partition/install数值结果核对通过，安装后不准备unused关系；未做实际线程运行、浏览器/transport/跨机验收。
- 初版完整app类型检查、三文件lint通过；最终私有cohort修复定向lint和相关场景通过，未重跑无关全套。
- `VITE_COMBAT_THREAT_RELATIONS=false`关闭；规模小、无共享组、observer界或source跨度不合法、更大horizon保留完整kernel；无法证明可拒绝的非有限source/mount行保留候选，不冒险裁剪。

文件：`C:/starsector-web-master/src/engine/ai/WeaponThreatCandidates.ts`、`WeaponThreatKernel.ts`、`WeaponThreatFrame.ts`。证据目录`C:/starsector-web-master/artifacts/combat-threat-relations-20261003/`，最终源码/hash、数值oracle、拒绝尝试与最后结果分开保存。

## 剩余主问题
56模块仍做自由机动站位/避障/steering，其物理仍附着母舰。本块只共享同组候选关系，没有声称解决这条职责错配。根舰真实角度/ETA精算仍约3638.54次/步，其它火控与投射物成本仍在；数值化或共享关系不等于游戏已经稳定60Hz。

目标原版0.98a-RC8，本机core/decompiled不存在，本块仅现Web规则内部等价执行重写，原版源码/实机/UI等价待核实。未操作桌面/子代理，未改生涯，未提交/推送/打包/发布，用户现场ms未复验。
