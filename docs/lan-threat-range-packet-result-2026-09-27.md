# 威胁评估短寿命射程包结果（2026-09-27）

## 裁决
行为合同通过，性能未过门槛，四生产文件已全部恢复before字节；完整725模块图一致。无默认启用、提交/打包/发布，无浏览器运行或联机Hz/P95改善结论。

## 实现与验证
仅在私有host显式VITE_LAN_THREAT_RANGE_PACKET=true、没有已有envelope且原boundWeapons为true、来源至少4挂点时，第一次range查询借用一次原完整modifiers对象。后续挂点仍使用原射程公式；第一次add后无条件与boundWeapons同时失效，不跨敌舰/assessment/ship.update。未知读者、runtime、辅助/父舰回退。
一次typecheck、改动lint及五项行为合同全部通过，未修复或重复：init/reinit176实体734挂点；5872逐挂点射程比较；8场景×78观察者完整威胁比较；9类护盾回调突变/异常/嵌套及phase/motion前置回调顺序；60完整步权威+隐藏tracker/RNG逐步一致。测量程序成功不等于性能合格。
示例模块assessment：getWeaponRangePercent调用400→112，借用35包；真实Engine第一步1768次借用。两次init一致；缺省无包、仍400查询。这些是指定场景计数，不是全帧固定比例。

## 唯一独立进程ABBA
固定三舰2玩家+20AI、seed917、3200DP。三个既有实验两臂均开。每臂150热身+120计时完整fixedUpdate，顺序A0/B1/B2/A3，各自独立隐藏Node进程。

| 臂 | 120步ms | 单步ms |
| --- | ---: | ---: |
| A0 | 4696.8298 | 39.1402 |
| B1 | 4650.7177 | 38.7560 |
| B2 | 4579.2311 | 38.1603 |
| A3 | 4789.2676 | 39.9106 |

两组省0.9818%/4.3856%，未同时达预登记3%。不调整门槛、不择优重测，也不把第二组作为稳定收益。四臂自然推进活跃名单171，完整状态hash均60469c9c42c5d3674b1c281a867ef027621588cc45718b5770079460eaf01e52。

## 文件和下一行动
恢复前先核对全部候选hash再恢复所有before，final-state.json确认725模块无漂移，之前保留实验未变。工件artifacts/lan-threat-range-packet-20260927含原始时间、合同、候选与回撤证据；scripts/check-lan-threat-range-packet.mjs默认重放历史冻结候选。
短读取span的收益不足以解决总体过载；下一步审计更大的模块交错阶段。Ship.update会执行statusEffects.advance、HullMod.advance、技能/运动/护盾/火控/部件更新，不能只凭root AI旧许可跨越；需要独立的已知写入合同、parent/sourceCarrier连通组失效及未知回调整体失效。此为待实现研究，不声称现行已有该优化。
