# 舰队维修总成本显示：原版先行（2026-09-20）

原版0.98a-RC8。继续上一轮单舰封存/启封操作链，补上Fleet侧栏已有的“完成维修需要的补给”，不新造布局/弹窗。用户原Fleet截图a6f03cc9-d29c-4dff-892b-1d4ac1653e5b.png显示该项在每日维修补给下方；本轮不进行新的截图、桌面输入或可见窗口操作，视觉/实机仍待许可。

## 来源 → 行为

- LogisticsModule.getTotalRepairAndRecoverySupplyCost(false)委托FleetData.getTotalRepairAndRecoverySupplyCostIgnoringLR：遍历现有舰队；!canBeRepaired且（非fighterWing或suspendRepairs）才跳过。不是所有船的维护费加维修费乘天数，也不因货舱当前补给不足将估计归零。
- FleetMember.canBeRepaired：!mothballed && !suspendRepairs && !isFighterWing。
- 每舰贡献为LogisticsModule.getRecoverySupplyUsePerDay × RepairTracker.getRemainingRepairAndRecoveryTimeIgnoringLR。
- RecoverySupplyUsePerDay：当仅修舰体/装甲（不缺CR）时用基础deployCR和基础CR恢复率，否则用有效deployCR/recoveryRate；部署CR分母至少0.01，恢复率非正返回0。
- RemainingRepairAndRecoveryTimeIgnoringLR：max((1-min(hull,平均armor))/满员repairRate, daysToRecoverFullCR)，上限1000天。CR已满或CR恢复率非正时其恢复天数为0。IgnoreLR不能误改成当前船员修理速度。
- FleetMemberStatus内部ModuleStatus.computeAverageArmorFraction按x外层/y内层float累加；null装甲或小于4×4的原版无效网格按1。当前reference拒绝模块舰，只计算其已支持的单体舰；读取估计不改写用户装甲网格。
- coreui/refit/auto/new.java：遍历非fighter成员，全部没有CR恢复率且并非全部暂停时，完成成本显示“不适用”；全部暂停/空舰队显示0。其它大改provider若没给足数据，仍是未知“—”，不是原版“不适用”。
- ui/*_cfr_61.java.getRoundedValueMaxOneAfterDecimal：>=10取整数，接近整数(<1e-4)显示整数，否则一位小数；0.04不是Web自创的“<0.1”。复用已有HUD数值格式。

## 本轮实现与验收边界

有效舰船stats补充只读维修估计输入；现有quote返回可空repairCompletion，现有私人后勤投影传给Fleet原有侧栏；不改变实际补给扣费。暂停/封存/启封和时间推进沿现有回执更新，不由UI推算总成本。

缺输入、非有限结果或未支持provider保留未知，不猜值；原版分母0会产生NaN的异常估计不显示假0。复用现有HUD/后勤/网关回归，补少量闭环断言与内存组件结构验证，避免再拆成大测试专项。


## 实施结果

- 原有侧栏现由权威后勤投影提供完成维修成本，原位显示成本／不适用／未知；封存、启封、暂停、恢复和推进时间后随服务器回执更新。不增加弹窗或改变布局。
- `includeRepairCompletion` 仅在HUD查询开启；60Hz后勤计费默认不扫描装甲格以计算只读总成本。新增字段是读模型，不改变实际计费、命令或保存规则，故本轮不提升规则锁（仍0.16.0）。
- 最终代码状态：已有HUD／后勤／网关三组串行回归47/47；严格campaign与app类型检查通过；11个相关文件单线程lint无诊断。日志：artifacts/campaign-repair-completion-regression.log、campaign-repair-completion-types-lint.log。没有新增独立测试脚本。
- 内存真实FleetPanel结构检查：18.75按原版格式显示19，明确不可适用显示“不适用”，缺数据显示“—”；侧栏行序保留。见artifacts/campaign-repair-completion-ui-structure.log。这不是浏览器点击或同状态截图验收；未启动可见窗口或操作桌面。
- 源码公式和当前有效属性输入已核实，不声称完整原版属性生命周期或像素级等价。全生涯、真实世界经济与战斗结算仍未完成；不提交、不打包、不发布。
