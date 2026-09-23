# 原版市场流通性与网络阶段：编码前对照（2026-09-20）

版本：本机0.98a-RC8；继续后台文件/Java验证。没有市场详情原版UI状态截图，本轮不改UI、不作视觉验收。

## 原版证据 → 预期

- `reach/CommodityMarketData.java:69–100`：同econGroup全市场，质心权重=max(1,size-1)，按原名单float顺序累加，最后乘float倒数。距离取超空间坐标，经Vector2f相减/length再除unitsPerLightYear；base=round((accessibilityBaseValue-distanceLY/accessibilityDistFromCOM)*100)/100，不以每市场最近邻替代，也不先排除hidden。
- 同文件`:123–140,169–204,469–501`：敌对权重=max(1,size-2)，与质心权重不同。按**有向**Faction.isHostileTo统计其他势力权重，除整个组总权重，四舍五入到0.01；本人势力不计敌对。core_base使用modifyFlatAlways（包括0）；core_hostile正penalty时设负值，否则删旧flat。
- `ReachEconomy.java:132–145`：null仅匹配null，命名组仅精确匹配；不是所有市场统算一次。要完整组roster，不得用Corvus局部冒充全核心世界。
- `CommodityMarketData.java:169–204,228–229`：exports用更新accessibility之前的shipping和availability；imports/available用更新后的shipping。不能为方便拿同一组fresh数据覆盖两阶段。
- `StatBonus.java:149–160,211–215,297–302`：具名插入顺序与MutableStat公式；computeEffective(0)保留mult但percent不影响0基数。原版float逐步舍入，不改成双精度连算。
- `Misc.java:435–436,645–646` + settings `unitsPerLightYear=2000`，settings accessibilityBaseValue=.5/distFromCOM=50/lossWhenAllHostile=1；已有shipping原版核验继续复用。
- `PopulationAndInfrastructure.java:101–123,156–173,189–195`：本地无港惩罚与size bonus；每次reapply先去掉原modifier。队首spaceport且没有别的正在新建行业时暂免无港惩罚。`Misc.getCurrentlyBeingConstructed:4434–4439`跳过population与升级，不把升级当新建。
- `Spaceport.java:26–31,53–80,160–166,199–206`：普通/大港+.5/.8，alpha+.2，改善+.2。先unapply清自己的修正和shared spaceport_improve，再apply。非functional再次unapply但最后**仍setHasSpaceport(true)**；不能把hasSpaceport改成functional。行业顺序影响人口读取到的hasSpaceport。
- `FreeMarket.java:64–83,111–121`：自由港condition reapply先移除再按勘探/压制加回，bonus=round((.05+daysActive/365*(.25-.05))*100)/100，范围[.01,.25]。daysActive必须实际状态；本轮不默认新计时、不声称advance已执行条件移除/稳定度或发展。

## 实现边界

已有产业commodity/max/price核只接受外部network。新增：本地人口/港口/自由港accessibility具名修正；按完整给定组roster/当前有向敌对关系计算质心/core；连接先前出口阶段与之后available阶段。上游其他技能、事件、封锁等已生效access modifier必须明确保留；未知产业物品/未知插件不静默忽略。

这是原版网络数值阶段，不是完整MainWorkTask2：稳定度/收入/市场份额、完整sector名单、真实任务/价格/库存发布仍需后续权威接入。roster输入可校验缺漏/顺序，但纯函数不能证明调用方提供的是完整真实宇宙；不得以coverage标签当证据。不改规则锁，不给玩家新系统权限，不刷新asOfTick。

## 验证方法

原版数据/源码hash导入；Java抽取原版质心/base/敌对/StatBonus/本地条件与行业access代码块，对照float状态；完整组名单、hidden、命名组、非对称关系、modifier顺序、前后shipping阶段及到available/现有price输入的集成测试；全campaign和类型回归。无桌面/可见程序操作，无子代理，无提交/推送/发布。
