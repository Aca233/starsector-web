# 剩余市场条件回调核对（实现前）

本机0.98a-RC8；仅后台源码/配置与无窗口Java验证。旧环境层仍不支持此12种条件；新回调核未接入完整世界前不更改“可发布市场”的判定。

## 原版证据 → 预期行为

源码根 decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/：

- econ/WorldArid、WorldBarrenMarginal、WorldIce、WorldTundra继承WorldFarming；后者构造参数没有任何应用，apply/unapply为空、showIcon=false。不能根据旧ConditionData常量擅自加农业倍率或hazard。
- econ/HighGravity/LowGravity：BaseHazardCondition外另加accessibility -0.1/+0.1；配置hazard分别0.5/0.25。MildClimate继承LCAttractorHigh（教会成分+30、hazard），另外人口增长+市场规模；配置hazard=-0.25。
- econ/SolarArray：抑制hot/poor_light，unapply无条件解除该集合成员；farming优先、不存在才aquaculture，供应bonusFromOther+2，不检查产业是否运作。不是直接给food数量+2。
- econ/LuddicMajority：宜居、有rural现存产业、没有industrial/military/command现存产业；玩家达成协议或管理员dardan_kato时失效。建设队列只检查第一个条目，并不把排队rural当成现有rural。此反直觉first-only行为另以原版jar字节码核对。功能/建设状态不排除现存产业。玩家击败远征后效果×2；稳定性+1×倍率，rural产业bonusFromOther+1×倍率；移民成分/增长=5×规模×倍率。unapply稳定性清除所有通道，生产只清flat。
- intel/bases/PirateActivity从PirateBaseIntel真实tier读取流通/稳定惩罚，5档分别0.1/1、0.2/1、0.3/2、0.4/2、0.5/3。0值apply不清旧值，unapply才清flat。
- intel/bases/LuddicPathCells：非潜伏时稳定性-1。isSleeper来自intel的市场派系；只有其factionId为player且玩家有协议才覆盖为潜伏，与市场playerOwned并非同一判定。
- econ/ShippingDisruption：损失流通惩罚=原版float/Math.round计算，结果0也强制0.01。玩家拥有市场且maxSupply>=max(0,round(available))+1时，清除flat中sh_loss前缀且round(abs(value))非零的modifier。不删除对应tempMods计时器、不清其它通道；unapply只清流通惩罚。持续时间推进与事件生成另属生命周期。
- starfarer_obf/.../Market.java:1101–1106：条件列表复制一次，但执行为**每个条件unapply后立即按当前survey/suppression决定apply**，不是先全体unapply再全体apply。SolarArray修改抑制集合后能影响后续条件，而早先条件不会被自动重做。应按原版一轮顺序，不能迭代到自创稳态。

## 实现及边界

新增12种条件的显式状态回调及顺序runner；已有/未知条件通过强制同步的委托回调接入，缺delegate不能跳过。保留当前输入对象、modifier顺序和严格float校验，原料可用量变化仍由真实世界的后续有序getter处理。不把已有环境/财务pipeline未接入的部分假标为完成。

测试：实际原版apply/unapply/eligibility/penalty与完整MutableStat/StatBonus方法块无窗口对照，覆盖产业/队列/管理员/协议条件、潜伏与海盗tier、供需修饰器保留、SolarArray先后顺序、suppression动态变化和缺delegate失败。

UI本轮不更改；默认、悬停、状态更新与同分辨率原版/Web截图验收仍待许可。无桌面操作，无子代理，无暂存/提交/发布。


## 本轮落地验证

已按上述边界实现，见 campaign-additional-conditions-progress-2026-09-20.md。新增来源目录包含28份哈希；1035条Java对照快照通过，15项定向测试通过。未开启旧pipeline/存档ready gate，未运行游戏或操作窗口。
