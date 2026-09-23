# 危险度/移民输入：原版先行审计（2026-09-20）

基线Starsector 0.98a-RC8；前一轮财务计算已验证，但hazard仍需外部传值，移民激励成本缺真实来源。本轮补条件危险度、移民回调名单生命周期和computeIncoming组合，不以固定数字填补缺口。用户在用电脑，仅后台文件/隐藏Java，无桌面/UI操作。

## 原版证据与预期行为

- `Market.java:139,210,577–582,670–673`：hazard MutableStat基础为0，真实新建/readResolve以haz_base flat+1；getter不截断。现有stat必须保留，不能每轮重造100%。
- `BaseHazardCondition.java:15–27`通过ConditionGenDataSpec读取浮点hazard，先unapplyFlat再按survey/suppression决定apply。`ConditionGenDataSpec.java:34–39`直接CSV float，无百分比额外除100。Habitable→LCAttractorMedium→BaseHazardCondition；资源矿藏、法外之地也继承它。没有genSpec/值0依然先移除旧修正。
- `Market.reapplyConditions:1101–1107`和`getAllImmigrationModifiers:1369–1374`：按condition顺序重放unapply/apply，移民回调实际为**永久LinkedHashSet再瞬态LinkedHashSet**的拼接，不对两个集合去重。
- `ResourceDepositsCondition.java:94–145,181–200`：资源先修改hazard；food条件只在找到farming或其缺席时aquaculture后注册永久移民回调，产业不工作仍可注册。其他资源不注册。资源unapply从永久集合移除。
- `BaseIndustry.java:182–216`、`Farming.java:31–49`、`Mining.java:28–41`、`Spaceport.java:34–80`：原版人口/港口/农业/采矿是瞬态回调。农业/采矿非功能时只清supply，回调仍在；港口非功能又unapply，会移除回调。不能统一按isFunctional过滤。
- `CoreImmigrationPluginImpl.java:135–187`：新建incoming，稳定度<5扣分；无计数工业且size>3按规模权重扣1%；accessibility先float百分比round，再除单位运输并截int（允许负值，不是shippingCapacity的非负结果）；hazard penalty；同经济组同超空间位置（距离LY<=0）最大非敌对邻居加分，敌对方向是**邻居→目标**。
- incoming基础派系权重按**所有产业节点数量**，不是Misc工业数量；海盗/穷人各1×数量，独立10×数量（目标敌视独立则改成本势力）。激励先于其他永久/瞬态回调。
- modifier实现来源：FreeMarket按真实daysActive线性成长3..10；Habitable教会20并size−1增长；LCAttractorLow/Medium教会10/20；DecivilizedSubpop穷人10并size增长；农业教会10；港口+2/大港+size；采矿按新需求的毒品最大缺口扣增长；人口根据所有产业AI核心、管理员核心和指定目标产业累计卢德左径权重。未知modifier拒绝，不静默跳过。
- `PopulationComposition.java:30–42,75–82,115–143`：有序float add；先移除不存在的派系，再normalizeToPositive。正权重只求正flat之和，不是net growth，也不包含percent/mult/base。即使net growth负，组成仍可能有正人数。
- `CoreImmigrationPluginImpl.java:189–218,235–242`：hazard先round((hazard−1)/0.05)、负数归0，再乘size倍率；成本=(−hazardPenalty+额外5)×每点1000。uiUpdateOnly不累计incentiveCredits，但若已到maxMarketSize仍会关激励。真实推进按days/30本次float增加，不合并历史帧。规模权重300×2^(size−3)。
- `Misc.java:5764–5766`：maxMarketSize是动态StatBonus在maxColonySize基础上求值并round，不把原版6硬写成不可修改上限。

## 实施/验收边界

新增hazard/回调重放与incoming计算，并组合前一轮本地财务；用条件列表真实计算hazard，保持每产业财务读取阶段。动态管理员/事件危险度/上限修正保持输入，不冒充技能刷新；真实完整经济名单、派系存在性与有向敌对值仍需外层提供/验证。人口advance的首次100次迭代、人口组成长期演化、扩张规模引发全产业重算、月度收款等尚未完成，不把incoming叫作完整人口模拟。

不改UI（本轮缺原版对应状态截图/实机验收）。原版方法/类级Java差分分别覆盖条件/回调顺序、完整已支持modifier的computeIncoming与激励，另做跨本地财务组合、严格输入、不可变和全campaign回归。

## 本轮复核补充

- 原版`MutableStat.recompute`的percent仅作用于base，hazard新建base=0时不能误把所有flat危险度乘percent。保留外部flat/mult/percent原状。
- `Market.getHazardValue()`直接返回stat，没有非负裁切。环境组合允许捕获的负hazard；财务仍按`PopulationAndInfrastructure.modifyUpkeepByHazardRating`用原版`minUpkeepMult=0.25`兜底，不在输入端偷偷改成0。
- `computeIncoming`的access百分比round返回int后先转float，再除100；hazard penalty的round结果同样先写float。实现显式保留这两个转换。
- 本轮没有新增UI证据，也没有操作原版游戏。Java探针是抽取方法/代码块测试：原版MutableStat/StatBonus/PopulationComposition全类，原版computeIncoming/激励/getNumIndustries/距离/回调方法，原版条件apply/unapply和移民集合API；引擎、供需副作用和完整经济组获取由显式stub提供。农业/采矿/港口的注册探针抽取BaseIndustry注册/注销块及各插件非功能分支，不声称跑完其全部apply。完整游戏/时间推进验收仍待后续。
