# 扩展条件 → 原版移民/人口推进：实现前核对（2026-09-20）

原版版本：本机 Starsector 0.98a-RC8。只使用后台文件与短串行无头探针，不启动游戏/浏览器，不操作桌面；不使用子代理，不暂存/提交/发布生涯内容。

## 原版证据 → 预期行为

- \decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/MildClimate.java:17–24：modifyIncoming 调用 LCAttractorHigh，然后以当前对象 modId 写入 owner market size 的 flat 增长。
- 同目录 LCAttractorHigh.java:33–35：Church composition +30。不是把最终人口直接加30，也不在此判断是否调查/抑制。
- 同目录 LuddicMajority.java:67–89：bonus=5f*size*getEffectMult()；只有 playerOwned && defeatedExpedition 才2倍。bonus>0才添加 Church composition 和 flat weight。回调不重新判断宜居、工业标签、建造队列或交易资格；这些影响先前注册，不是本次 incoming 回调的守卫。
- impl/campaign/population/CoreImmigrationPluginImpl.java::computeIncoming：按 market.getAllImmigrationModifiers 顺序调用实际注册对象，再剔除不存在势力，normalizeToPositive。原版 Market.java 的集合顺序是 permanent 后 transient，不跨集合去重。
- CoreImmigrationPluginImpl::advance：一次 advance 只初算一次 incoming；首次100次迭代，普通1次；增长后的重应用改变后续 getter，不能悄悄重算本次 incoming 或重复收取补贴。
- impl/campaign/econ/impl/PopulationAndInfrastructure.java::modifyIncoming：只查产业 AI core、管理员 AI core 和4个指定产业是否存在；不读取 specialItem。ItemEffectsRepo.java:210/233/256/374/388/479 的两种 nanoforge、synchrotron、biofactory、catalytic、holosuite，及 BoostIndustryInstallableItemEffect::apply/unapply 只影响既有产需/品质/收入；没有独立移民注册。incoming 读取此前真实 demand 状态，而不是自行安装物品或重算其效果。

## 当前差异 → 本次改动

1. 条件阶段已生成 MildClimate/LuddicMajority 注册，但 computeOriginalIncoming 的旧60条件校验拒绝它们。增加明确 incoming 校验模式接收已实现72条件；独立旧环境重应用不假装支持新增条件。
2. 使用已核对的 applyOriginalAdditionalIncoming 执行两个回调；不复制公式，不过滤实际注册对象。其余新增条件没有 incoming 回调，错误注册仍拒绝。
3. 新增可选 luddicMajorityState={playerOwned,defeatedExpedition}，存在 luddic_majority 时必须提供、没有时禁止提供。它们是同一市场/全局的真实 getter，不能给同市场多个条件填相互矛盾的状态。人口推进初始及增长驱动返回时核对该 ownership 与人口 ownership 一致。
4. incoming 只允许已有核函数支持的6种物品的准确产业绑定；未知/错绑仍拒绝。无效安装条件不在这里重验——这是已安装快照、不是安装命令。
5. 扩展条件的 population 条件替换只改变人口条件身份，不运行额外回调。完整 local-growth accessibility 仍需共享条件阶段接入；本次不把它的旧拒绝改成静默放行。

## 验证与边界

- 扩展原版 Java incoming 探针抽取 LCAttractorHigh/MildClimate/LuddicMajority 的真实方法；以 getter 桩提供所有权与远征状态；不伪造完整殖民地事件系统。
- 对比尺寸0–10、所有权/远征组合、重复集合、被抑制但仍注册对象、无注册、删除势力、补贴 UI-only 等分支；检查旧环境仍拒绝新增条件、错误状态/物品绑定拒绝。
- 用原版 advance 交叉验证新增条件进入人口累计（包括首次迭代）；增长驱动接口验证所有权与人口条件替换。
- 这不是完整世界恢复或全经济权威证明。没有新增 UI；原版界面、Web 界面及实机交互仍待许可后验证，不声称通过。

## 增长链补充核对（在桥接改动之前）

首次新增 incoming 定向测试10/10通过后继续定位到 local-growth 旧入口拒绝新增条件和所有生产/特殊产业。

- PopulationAndInfrastructure.java:101–118/194–195 只读先前 hasSpaceport/首队列构造状态及当前 size，更新两个产业可达性 key；Spaceport.java:53–79/161–166/202–204 更新港口/core/improved key，非功能港口 unapply 后仍 setHasSpaceport(true)。这些操作在条件阶段之后，不应再次跑 FreeMarket/Gravity/Shipping。
- HeavyIndustry/FuelProduction/LightIndustry/Refining、TradeCenter（保存别名 TradeCenter2）、TechMining、Cryosanctum、LionsGuardHQ 的 apply/unapply 没有额外 accessibility 写入。前文6种物品同样没有 access 副作用。产业可达性阶段可以接受这些已支持产业/物品，不能因此宣称其其它动态机制已实现。
- 改动：从旧 local accessibility 中抽出真实产业阶段；旧合并入口仍运行旧条件白名单，共享增长入口消费同一次条件结果的 accessibility、conditions（包含抑制变更）及最新 commodities.available，再只运行产业阶段。核对前态 access 以及 Church getter/财务治理所有权的一致性。
- 验证：真实条件→商品/财务→产业access→incoming→advance增长；共享原版条件探针输出再送入既有原版产业access探针，跨阶段不伪造额外条件循环。保留完整世界重应用/事件驱动未完成边界。
