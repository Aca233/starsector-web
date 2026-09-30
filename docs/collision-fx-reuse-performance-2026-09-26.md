# 碰撞阶段FX回调复用：实测否决与回退（2026-09-26）

## 结论
**候选已撤回，没有新的生产提速补丁。** 200舰真实Host固定配对中，模拟均值降低1.16%，但完整交付均值增加0.93%、P95增加2.04%，六个连续区间中五个交付更慢。显示编码阶段（本轮未直接修改）均值增加5.04%；不能忽略这部分代价，也不未经剖析将原因归结为GC/JIT/调度。
本轮理论重复对象数很大，却没有取得完整交付收益。源码层面的创建次数不等于V8实际分配字节；JIT可能消除部分分配，GC成本也不必落在创建对象的阶段。计数证明执行路径发生变化，不证明堆占用或速度按同比例改善。

## 实现与边界
修改前来源见collision-fx-reuse-source-notes-2026-09-26.md。本机0.98a-RC8 CombatEntityAPI的实时位置/速度/碰撞类别/半径/质量/轮廓/护盾及CollisionClass仅作规则边界；原Web碰撞系数未完成原版核验的注释保留。未做原版可见实机验收。
唯一生产文件CombatEngine.ts：把原双循环放入private阶段方法，实际callee是原生ShipCollisionSystem实现时每阶段惰性创建一个FX对象及5个回调；自定义/包装/替换callee仍每对获得独立对象与函数。每对重新读取system/method、保持receiver、参数顺序；箭头回调仍即时读取engine方法、fxSystem和playerShip。无物理快照、无跨阶段持有、不改变配对顺序、几何、伤害、特效、精度、频率、实体或字段。

## 集中正确性验证
一次typecheck（12,274ms）、4个改动代码/测试文件oxlint（83ms）、既有check-gloriana-void全23项（1,193ms）通过。新合同2,177检查、12个完整权威状态比较；332次原生配对中旧FX对象332个、候选12个（6种场景各2阶段）。覆盖远距、实际舰体撞伤、普通/相位/void护盾、死亡、模块，自定义getter/receiver/自身call属性、中途native→custom→native、异常、迟读取、0/1舰与原生/自定义重入。实际FX调用参数和顺序、完整权威数据均一致。
新合同与只读FX身份探针仅在测试构建；参考循环来自本轮修改前Engine原字节提取。原版视觉和实际双设备联机未从这些测试获得验收。

## 独立默认自动模式激活/恢复诊断（不是速度证据）
200舰、0预热、55tick，raw Worker驱动、--decode --fire-query-audit。初始化/新Worker恢复均：phases=55、nativePairs=1,094,500、customPairs=0、bags=55。该规模源码语义下旧循环每步创建19,900份FX与99,500个箭头函数，新路径每阶段1份FX与5个函数；没有测量实际V8分配字节，不把此比率解释成提速。
55次witness、56次显示图比较及恢复的witness/完整权威＋隐藏状态/显示通过。默认模式tick25启动、tick27为4个Owner、19个fresh batch、invalidated=0；tick49因no-measured-benefit回串行。火控资格与上一轮相同，无调度策略变更。

## 正式真实Host配对（无计数/profile/stages）
命令：
```text
node scripts/benchmark-real-workers.mjs --host-pipeline --serial-pair --count 200 --warm 150 --steps 180 --baseline artifacts/collision-fx-reuse-20260926/baseline-sources.json --candidate artifacts/collision-fx-reuse-20260926/candidate-input-sources.json --freeze artifacts/collision-fx-reuse-20260926/measured-sources.json --out artifacts/collision-fx-reuse-20260926/host-serial-pair-200
```
200 Onslaught、seed917、固定dt，150预热+180测量，独立无头Edge153。三臂逐tick交替且固定串行，仅比较before/after；freshBatches=0、invalidated=0。一次正式实验，不择优重测。前后313模块仅Engine变化，measured图与候选图完全相同。

| 阶段（ms） | 旧均值 | 候选均值 | 均值变化 | 旧P95 | 候选P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 41.853 | 41.369 | -1.16% | 50.835 | 49.940 | -1.76% |
| 显示编码 | 21.098 | 22.161 | +5.04% | 28.300 | 30.700 | +8.48% |
| Host发起→原始ACK | 63.368 | 63.981 | +0.97% | 75.710 | 76.190 | +0.63% |
| Host呈现处理 | 11.055 | 11.133 | +0.71% | 14.855 | 15.045 | +1.28% |
| Host完整交付 | 74.455 | 75.146 | +0.93% | 88.870 | 90.680 | +2.04% |

P95从原始样本按floor((n−1)×0.95)重算并断言与runner汇总一致。hostPresentationMs包含decoder.apply及Host地图/部署/字符串处理；deliveredMs包含Host.step至promise完成的复制/排队/ACK/日志，但不包括渲染、网络、rAF节拍或input-to-photon。

| 连续tick | 模拟均值变化 | 编码均值变化 | 完整交付均值变化 |
|---|---:|---:|---:|
| 151–180 | -0.26% | +6.15% | +1.65% |
| 181–210 | -2.61% | +2.96% | -0.99% |
| 211–240 | -1.52% | +6.52% | +1.08% |
| 241–270 | +0.80% | +6.02% | +1.85% |
| 271–300 | -3.33% | +6.24% | +1.12% |
| 301–330 | +0.09% | +2.59% | +0.84% |

660次witness、662次完整显示图（18,103,234个比较节点）、11个完整权威/隐藏火控/RNG检查点通过。三Host均ready、pendingTransactions=0、tick=330、journalEntries=1、epoch=1、sequence=331。分块不是独立重复实验，不声称跨设备显著性。

## 精确回退
当前候选hash核对无漂移后，Engine及两个改动测试脚本按原始Buffer恢复；新helper经存档hash核对后从活动scripts/lib移除。恢复后313生产模块与baseline完全相同，三个原文件hash一致，两个脚本node --check通过；基线已在本次真实Host前臂执行，不重复跑全套。之前有效的资格名单、静态Guard、Owner观察字段及编码/解码优化均未撤回。

工件位于artifacts/collision-fx-reuse-20260926，含原始/候选文件、完整冻结图、所有合同/激活/配对日志、performance-analysis、post-measure-verification、rollback及final-verification.json。候选测试插桩保存在candidate-files，不残留在活动benchmark中。

下一步转向采样实际分配及GC调用链，避免再把对象创建的静态计数当性能收益。总体优化目标active；没有提交、推送、打包、发布、子代理或可见窗口。
