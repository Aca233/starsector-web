# 依赖组武器威胁粗筛结果（2026-09-27）

## 裁决：失败，生产候选已撤回
本轮不是性能改善交付。默认关闭的VITE_AI_GROUP_THREAT_BOUNDS曾实际运行，减少源循环，但唯一ABBA的两组耗时分别增加4.6707% / 1.7130%，未达实施前固定的两组各省5%门槛。没有重复测速择优、改变门槛或启动浏览器。测试进程exit=0只说明测速/状态检查执行完成，passesPrescribedGate=false才是本轮性能裁决。

## 基底与边界
重新冻结738个非campaign源码/JSON模块（不是早期726/735基底）；相对上一轮基底有13个新增/变动模块，见baseline.json，两边完全同源。真实2玩家+20AI：web_zhuyuan/web_gloriana/web_sc2_hyperion循环，seed917、3200DP、初始176实体734挂点。四个既有默认关闭实验在A/B都开启，新候选是唯一变量。无UI/玩法/Hz/实体数量/精度/画质/保护阈值改变，无原版实机验收。

## 实现与正确性
新增的是owned-interleaved阶段parent/sourceCarrier组AABB/速度分量/最大射程上界共享，不是上轮recovery重排、资格缓存或相位缓存。剩余源严格按原顺序精算，弹体与光束原样实时评估。原有每次AI、ship.update后的整组失效同步清除边界；unknown runtime/hook关闭粗筛，名单身份/顺序变化回退；exact-only、默认关、close不启用。
首次typecheck/三文件lint通过。首轮合同暴露weapons是原生getter而非own数据，v1从未启用粗筛；已定向修复为身份审计并补齐传递读者。v2完整九合同中8项通过；剩余组合同有两处错误fixture假设：初始h=3允许保留23个保守候选，不应断言零；默认enemyShip本身无模块，应选择真实敌方模块组。仅修复并重跑该合同，不更改生产v2或性能门槛。有效证据为contracts-2/proofs.json的8项 + contracts-groups-2/proofs.json的1项；v1证据不参与准入。

- init/reinit/default：176实体、734挂点、启用路径计数真实、finally关闭。
- 22依赖组，初次11敌方组构建；重复observer复用；父子/载机失效；混合换队；名单增加/减少/重排回退；射程/速度/系统/护盾/可见性/退场变化。
- 14种实例读者替换、原型替换、runtime/父链/phase回调不越权前移；未知回调的顺序、异常、重入结果一致。
- 48组浮点/位置速度场景：906个被排除的敌源逐个满足原有单舰距离拒绝，3846个保守保留；NaN/Infinity/负h/半径、无限射程回退。
- 252组真实预测值与顺序相同；真实挂点生成弹体/beam，两种即时威胁均非零且beam后续变化可见。
- 60完整步技能/靠近开火/排散/封舱场景逐步authority+隐藏火控/RNG完全相同；异常fixedUpdate finally关闭。
- 自然20/270步完整状态一致；20步还与未插桩基底交叉核对。270步终点171活跃实体，不能单据此推断战损。

20步hash：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224
270步hash：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6

## 非计时工作量与唯一整步计时
warm120源循环 1581788 → 654063，减少 58.6504%；120个真实owned阶段启用、组bound构建2640次。它只描述调用量，不是性能、Hz或延迟收益。

独立隐藏Node顺序A0/B1/B2/A3，每臂150热身+120完整fixedUpdate(1/60)，无计数/采样插桩；不计启动、导入、热身与最终状态捕获。

| 臂 | 120步 ms | 每步 ms |
|---|---:|---:|
| A0 | 4514.6128 | 37.62177 |
| B1 | 4725.4779 | 39.37898 |
| B2 | 4650.7006 | 38.75584 |
| A3 | 4572.3779 | 38.10315 |

四臂171实体、终态hash全部一致。两组各至少节省5%的门槛失败。该结构的整体维护成本超过所省循环；未做候选CPU采样，不能把净回退精确归因于某个getter、反射或GC。heapBefore/After只是快照，不能当作分配量或GC成本。

## 精确恢复与并发修改
撤回前核对三文件绝对路径、current candidate SHA、before SHA；归档rejected-source后逐字恢复Ship.ts、WeaponThreatEnvelope.ts、ThreatAssessment.ts，三文件恢复SHA全部匹配before。本轮最终738模块中735匹配冻结基底；以下3个写集外并发修改保留，不能宣称恢复了整个旧源图：
- src/engine/extensions/ship-systems/AdunSolarForge.ts
- src/engine/render/webgl/AdunFXRenderer.ts
- src/engine/render/webgl/passes/WebGLFXPass.ts
没有提交/暂存/推送/打包/发布、没有启动可见窗口。当前无新增活动生产候选；只保留历史冻结、验证脚本与文档。

## 对下一步的约束
这轮否定的是这版带资格审计、组边界维护和候选列表构造的实现，不是否定空间粗筛本身。不要在相同结构上再堆缓存或因循环次数下降就宣布提速。优先评估火控更大粒度的数据通路：把反复适配对象的纯数字候选求解与状态写回边界分开，而不是再次只复用单次prepare结果；需要先证明同样的精度、RNG、目标顺序与回调语义。另一条路线是整体迁移权威步骤的data-oriented/WASM内核，但需要跨边界成本证据，不能把GPU/多线程当成现成收益。
现有浏览器开场过载问题本轮未重验或解决，无有效Hz/输入P95改善结论。继续优化目标保持active。
