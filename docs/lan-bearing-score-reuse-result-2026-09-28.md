# 炮组重复评分调查结果（2026-09-28）

未实现缓存、未修改生产源码。当前重新冻结772模块，源图SHA107ba77bbafed54f8d82426a1c323f883ae48659f4623eba3c2ee6e8af16461d。完整3486资源；单次原算法270完整步，只计数、不计时。176实体734挂点、自然末态171；原候选比较/顺序没有改变。

热120步：3040次combatProfile、65194次实际评分；重复评分2736次。382523次射界检查中仅12594次重复（3.29%），255755次需要三角函数的检查中8750次重复（3.42%）。>=8炮组的240次调用全部是12炮组，14880次评分没有一次重复。没有理由为此引入Map、分配和查询成本。

同时纠正文件级采样的可能误读：ShipCombatProfile文件inclusive166.976ms包含从ThreatAssessment等调用的weaponRange/weaponDps，不能把它当成combatProfile函数耗时。按同一生产式profile的实际函数栈，combatProfile合计20.661ms，只占1840.834ms非idle的1.122%，不存在“优化朝向评分就能省9%”的证据。没有新采样/计时重跑。

本方向在实现前排除，不保留实验开关、不做ABBA或浏览器重测。源图计数结束无漂移，未覆盖其它工作。下一步转向真实热点中的属性组合器，避免此前方案的缓存资格开销。原版证据及限制见source-notes。工件artifacts/lan-bearing-score-reuse-20260928，关键work-counts.json、decision.json；goal仍active。
