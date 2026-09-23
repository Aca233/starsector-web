# 生涯同需求类库存/价格进展（2026-09-20）

## 已实现

新增 OriginalCommodityClassPricing.mjs/.d.mts，复用既有原版来源数据。原版先行证据见 campaign-class-pricing-native-audit-2026-09-20.md。本轮继续只做后台文件/隐藏Java/无头验证；没有使用子代理、桌面输入、浏览器、游戏窗口或新UI。

- 原版库存/价格按完整有序需求类更新：一份共享需求、各自greed/玩家modifier/价格calculator，不能把蓝龙虾当成独立主商品。
- 主商品及同类变体触发同一类更新时分别使用各自ID种子；后触发的蓝龙虾会重算主商品需求和库存。变体自己的现有stockpile保留，不无根据生成库存。
- 变体价格calculator用主商品规格（luxury_goods的V3，而非lobster自身V4），阈值仍用各自实时供需、库存、经济单位和贸易修正。
- 支持所有19个原版经济触发规格，包括ships/meta；保留无primary/空类列表、no-demand标记、零修改器与原生float边界。定价阶段不重算产业、不自行清零变体已继承需求。
- 原有主资源单行接口仍保留严格边界；48个旧接口对照向量保持等价。新接口不发布交易快照、零售库存或账户变化。
- 之前两市场完整目录组合测试扩展到月末/非月末两种：本地产业/环境/财务/流通 → 19个商品网络 → 类级库存价格（仅月末，两个市场合计38次）→ 市场重放 → 人口。组合使用真实规则模块，但运行时仍是测试适配器。

## 验证

- 原版隐藏Java：提取完整 MainWorkTask2.updateStockpileAndPriceV2/getStockpileQuantity、CommodityOnMarket.updateCalc/库存setter/getter/贸易换算、CommodityIconCounts、MutableStat/StatBonus；120条四步连续历史 + 19个经济规格各一次，共499份状态一致。引擎getAvailable、运输容量及网络出口以捕获getter提供，不是完整引擎运行证明。
- 类级价格与编排组合：26/26通过，artifacts/campaign-class-pricing-integration.log。
- 全campaign回归：641项，636通过，0失败，5个既有可选探针跳过，artifacts/campaign-class-pricing-regression.log。
- 严格campaign类型和完整tsc-b均exit 0，artifacts/campaign-class-pricing-types.log。新增契约检查共享需求、不可变输出、阶段限制与禁止假库存证明。
- 6个相关实现/声明/测试脚本定向oxlint通过，artifacts/campaign-class-pricing-lint.log。未宣称仓库全量lint通过。
- 暂存区为空；tracked diff --check通过，新建未跟踪文件单独检查空白/冲突标记通过。没有提交、推送、打包或发布。

## 剩余真实边界

新内核要求当前getter值在该次计算内稳定、primary网络已经初始化。若运行时第三阶段惰性建网络会改变第四阶段getter，必须按原版顺序执行真实回调，不能伪造一个冻结快照覆盖它。上述Java差分与两市场测试不证明这种副作用已贯通。

正式sector经济仍缺逐getter产业/管理员/监听器运行时、完整市场来源与其余产业/物品插件、月账结算与权威发布。现有零售/报价模块需要由真实运行时提供新鲜数据、异域效用和权限；经济stockpile不等于可购买的submarket库存，不将本轮结果直接伪装为交易数据。Corvus仍保持industrySimulation=not-executed。

下一步转向这些真实市场依赖和权威运行时接线，不继续把测试宇宙称作正式玩法。原版UI同状态验收、殖民地/势力/自创势力、任务/战斗以及独立/合作生涯端到端仍未完成，目标保持进行中。
