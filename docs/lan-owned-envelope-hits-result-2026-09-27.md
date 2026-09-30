# 私有交错包络命中资格复用：未通过，已撤回（2026-09-27）

## 裁决与状态
本轮没有新增可保留生产提速。五项行为合同和测量执行均一次通过，但唯一ABBA两组分别省0.7479%、慢0.0309%，未同时达事前每组至少3%的门槛。测量脚本退出0不等于passesPrescribedGate=true。
已逐SHA核实两个候选/备份后归档rejected-candidate，再精确恢复WeaponThreatEnvelope.ts与CombatEngine.ts；全部726基底模块无漂移。之前四个默认关闭实验和其它所有工作保留。未提交/推送/打包/发布，未启动浏览器验收。

## 实现与合同（生产已撤回）
只在已认证私有交错写段内，让已有包络缓存命中复用未变化来源的资格证明；不新建Map/相位缓存。当前writer的parent/sourceCarrier整组、miss、generic/exact-only、写段外、未知效果、原生Vector2.set身份变化仍实时检查。模块AI后及ship.update后的组失效保持，finally关闭。

一次typecheck、改动lint通过，无修复或重测。五项合同：
1. init/reinit真实176实体734挂点，开启各78次writer标记；关闭/默认均0；返回后组标记清除且缓存关闭。
2. 组外命中才复用，父舰/载机同组仍读实时资格；source新增效果和invalidated miss拒绝；exact-only、未知writer、重复begin/关闭拒绝。
3. 普通许可getter触发invalidate时先许可再Map的顺序不变，异常传播一致；7类未知writer回退、Vector2.set身份变化和Engine异常finally关闭。
4. 20初始完整步源码内计数：exact资格读取147200→53920（少63.37%），列表读取1692701→1599421。不是CPU/GC/分配字节。完整authority+隐藏tracker/RNG均bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
5. 60完整步含技能、近距开火、排散和封舱，逐步完整authority及隐藏tracker/RNG一致。

## 唯一ABBA
四个已有实验两臂全开，仅本候选不同；各臂独立隐藏Node，150热身+120完整固定步，三舰2玩家+20AI、seed917/3200DP。

| 臂 | 120步ms | 每步ms |
|---|---:|---:|
| A0 | 4236.5972 | 35.3050 |
| B1 | 4204.9109 | 35.0409 |
| B2 | 4755.4535 | 39.6288 |
| A3 | 4753.9851 | 39.6165 |

两组0.7479%/-0.0309%，passesPrescribedGate=false。四臂自然终点171活跃实体，完整权威+隐藏火控/RNG均bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。不能跨实验算累计收益、挑最好臂或把瞬时heap当GC结论。

## 后续证据方向
继续叠加小缓存的假设已不足。生产恢复后做一次Node热身后CPU采样，定位真实完整热循环主要成本，不再只依赖浏览器短冷启动和getter调用数；见lan-warm-loop-profile-result-2026-09-27.md。本轮没有新Hz/输入P95/联机可玩结论。

完整工件artifacts/lan-owned-envelope-hits-20260927，历史脚本scripts/check-lan-owned-envelope-hits.mjs默认重放冻结候选，包含ABBA，不能为择优重复执行。
