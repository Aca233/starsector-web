# 富勒烯线轴港口效果：实现前对照（2026-09-20）

原版0.98a-RC8。证据先于编码；本轮不操作桌面，不用子代理，不提交/发布生涯内容。

## 原版证据 → 预期

- special_items.csv中fullerene_spool使用GenericSpecialItemPlugin，plugin params严格为spaceport,megaport。原版名称/图标保留在来源数据中，不改UI。
- ItemEffectsRepo.java对应匿名类：apply在market.accessibility的flat通道以物品id写FULLERENE_SPOOL_ACCESS_BONUS=0.3f；unapply只unmodifyFlat此id，其它channels不清。
- getSimpleReqs依次NOT_A_GAS_GIANT、NOT_EXTREME_WEATHER、NOT_EXTREME_TECTONIC_ACTIVITY。BaseInstallableItemEffect::getUnmetRequirements(industry,false)强制prelim/full=true，因此apply不以survey级别跳过限制。
- 气态巨行星判断来自market.getPlanetEntity().isGasGiant，不是猜某个conditionId；没有PlanetEntity时此条件允许。另两个限制用market.hasCondition，Market实现读取条件cache，不排除suppressed/unsurveyed条件。
- BaseIndustry.apply先更新供需/财务，再AI/improve，再注册移民，然后检查物品要求并apply或unapply物品。Spaceport继而添加港口基础access；若不functional，清supply并unapply（含物品），随后hasSpaceport仍置true。
- BaseIndustry.unapply先AI/improve清理，再移民解除，最后物品unapply。一个市场若存在两港口，线轴共用物品id；较后不工作的港口可以移除前面港口写的同id项，不能私造引用计数或按物品个数叠加。
- 无线轴的产业不能主动删除现存同id modifier；卸下物品应在清除special之前执行原版unapply，不通过下一轮“猜测旧物品”替代生命周期。

## 差异与改动范围

目前civic商品、财务、immigration、access都拒绝线轴。线轴不改变供需、财务或独立移民回调，这些阶段只增加精确产业绑定支持；实际+0.3及限制进入港口access顺序。

新增可替换的port-item效果模块/来源目录，独立apply/unapply及限制检查；抽出的产业access阶段必须获得显式planetIsGasGiant（null表示没有行星）与conditionIds，不能默认为适用。旧combined access校验重复conditionIds与自身roster一致；增长重应用由真实条件结果构造这些IDs，并要求显式行星getter。

## 验证

导入器记录来源哈希/CSV绑定和原版限制文案；定向测试涵盖限制组合、无行星、抑制条件、停工/新建/升级、AI/improve、重复港口及旧modifier保存。扩展现有Java港口探针，调用抽出的真实ItemEffectsRepo方法与BaseInstallableItemEffect限制方法；串联到已有商品→财务→增长→incoming。

物品安装/移除UI与实机显示仍待验证。本轮只实现已安装快照的规则效果，不因此声称整个私有存档世界恢复完成；真实行星getter/管理员/事件/网络/库存仍需恢复。
