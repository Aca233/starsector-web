# 生产产业原版最小对照（实现前）

版本：本机 Starsector 0.98a-RC8。只核实当前要补的生产规则，不修改 UI，不操作桌面。

## 证据 → 预期行为

- decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/LightIndustry.java apply：有机物需求=size；日用品=size，奢侈品/毒品=size-2，仅合法商品生产，非法时写0；有机物短缺写入 ind_*_1。0/负数写入不会清除已有 ind_sb。
- Refining.java apply：重型机械=size-2，矿石=size+2，稀有矿=size；金属=size、稀有金属=size-2，分别取重型机械与对应矿石的最大短缺。
- HeavyIndustry.java apply/unapply：重工业及轨道工业产量相同；短缺上限=size-3（不擅自钳制为非负），写 ind_*_2；轨道工业仅提供0.2质量加值，前次稳定性<5另给惩罚。不运作时清空产出并unapply，包括纳米锻炉质量和物品bonus。品质是市场级StatBonus，不是产业私有MutableStat。
- FuelProduction.java apply：挥发物=size、重型机械=size-2；燃料=size-2，只受挥发物短缺影响。额外管理员 fuel_supply_bonus 在super.apply之后覆盖ind_*_2。燃料/重工业商品供需始终合法。
- BaseIndustry.java apply(boolean)、updateSupplyAndDemandModifiers、supply/demand、getMaxDeficit、applyDeficitToProduction：AI/改进/管理员/其它modifier之后应用物品；需求截断为int，modifier保持float及插入顺序。供需只选最大值，不求和。unapply不会清空全部供需maps或supplyBonus。
- ItemEffectsRepo.java、BoostIndustryInstallableItemEffect.java、BaseInstallableItemEffect.java：生物胚胎+2需habitable，催化核心+3/同步加速器+3需no_atmosphere；受损/完好锻炉+1/+3及质量0.2/0.5。条件检查是hasCondition，不是已调查/未抑制条件；unapply物品写0，保留已存在的neutral条目。
- HeavyIndustry.java advance/updatePollutionStatus/setSpecialItem：纳米锻炉污染属于时序生命周期，不可以只应用静态生产就冒充执行了污染。此次商品pass与品质效果仍不宣称恢复该生命周期。
- starsector-core/data/campaign/industries.csv 与 special_items.csv 确认5个产业ID/插件类、物品匹配、图片路径、财务原始配置；运行数据与来源哈希独立保存。

## 当前差异及实现范围

当前commodity pass只有资源与民用产业，真实保存态中上述四类有41个实例被拒绝。增加显式输入的生产产业规则并接入同一有序pass，带市场品质状态、真实可用量、管理员燃料加成和物品条件；缺输入拒绝，不能填零。继续不宣称post-save恢复、全星区经济执行或交易发布。财务与环境接入按实际已支持接口核实，不为了通过测试盲目放行。

UI：此轮不新增/改动产业面板；原版实机与Web同状态截图验收仍待许可和证据，素材路径不能证明布局或交互。

## 验证方法

独立无窗口Java方法块探针执行本机原版4个apply及HeavyIndustry.unapply、完整MutableStat/StatBonus、供需/短缺辅助方法；对比历史状态、float、合法性、品质、物品有效/失效。合成夹具覆盖小市场、缺货、核心、改进、建设/升级/停产及重复应用，不使用私人存档数据作为测试夹具。再跑有序pass集成、全campaign回归、类型、定向lint；源存档只读、不提交发布。

## 接入时补核

已检查4个完整产业类：无额外收入/维护/移民回调；BaseIndustry.apply(true)先做继承财务更新，物品Boost与锻炉回调只动供应bonus/生产质量。因而扩大原有财务、产业计数与环境登记目录，并用既有原版财务/稳定性/移民探针覆盖，保留污染advance未执行的边界。动态品质使用StatBonus.getFlatBonuses/getPercentBonuses/getMultBonuses，而非MutableStat的getter。
