# 殖民地危险度与移民来源进展（2026-09-20）

本轮完成的是原版来源明确的**危险度、移民回调生命周期、incoming计算和激励费用**，不是完整人口模拟或生涯模式完成。没有改UI、没有操作桌面、没有子代理，也没有提交/推送/打包/发布。

## 实现

- `scripts/import-campaign-immigration.mjs` / `src/campaign/data/reference-immigration.json`固定38个本机原版来源哈希、59种已支持条件、21种已支持产业。导入原版hazard/移民参数与condition_gen_data，不手填“平衡值”。编码前对照见`campaign-immigration-native-audit-2026-09-20.md`。
- `OriginalColonyEnvironment.mjs/.d.mts`：保存既有hazard具名stat；按条件顺序unapply/apply；重放永久与瞬态LinkedHashSet的移民对象身份和顺序。只在真实新建时使用`haz_base=1`。未知插件/缺失对象/集合内重复拒绝。
- 资源food回调只在有农业或水产节点时注册，非功能农业/采矿仍保留回调，非功能港口取消；两个集合间不去重。源为实际原版生命周期，不是统一的“工作中才生效”规则。
- `OriginalImmigration.mjs/.d.mts`：新建incoming组合；稳定度/无工业/有符号流通性/危险度/同位置非敌对邻居；按真实产业节点数量的初始派系权重；已支持条件/产业移民回调；移除不存在派系，再按正flat权重归一。保留native float及回调顺序。
- 激励按动态max_market_size决定是否关闭；UI-only不累计费用，但到上限仍关激励；非UI调用按本次days/30以float累加费用。返回monthly getter与本次累计额，不直接修改玩家账户。
- `reapplyOriginalEnvironmentalFinancialPass`把条件计算所得hazard送入已有本地财务组合，取消该组合的手填hazard标量；保留全产业循环后才更新hazard倍率以及各产业先前财务读取点。负hazard按原版允许，维护费仍有0.25下限。
- 复用并公开`countOriginalIndustries`，不把全部产业节点数量当成工业槽计数；施工队列、原版结构升级保持原有语义。

## 验收与证据范围

- 专项15/15通过（`artifacts/campaign-immigration-targeted.log`）。其中**198组原版Java incoming计算**与**118组原版环境/回调顺序**逐项比较有序状态及float值；使用安装包原始lwjgl_util.jar计算Vector2f距离，覆盖极小距离下溢与size0..10。
- 另覆盖危险度残留清除、外部stat保留、农业/港口非功能差异、回调跨集合重复、负流通性、邻居方向及同分顺序、正权重归一而非净增长、UI激励关闭/不扣费、跨财务读取阶段、错误输入和不可变类型边界。
- 原版Java探针是**类/方法/局部注册代码块**级验证。经济组和有向敌对输入为stub；不是原版实机、整宇宙、完整技能/事件、完整产业apply或Web端到端验收。
- 全campaign回归602项：597通过、0失败、5项既有可选原版探针跳过。日志`artifacts/campaign-immigration-regression.log`；旧稳定度和财务差分包含其中。
- 严格campaign契约和全项目`tsc -b`通过；`artifacts/campaign-immigration-types.log`为空。仅本轮实现/声明/专项脚本执行oxlint --deny-warnings，不冒称全项目lint通过。

## 未完成及下一关键路径

1. 原版`advance()`的首次100次迭代、现有人口构成演化、海盗转换、规模增长触发conditions/industries重算；这些不能由incoming单次结果替代。
2. 管理员技能/事件的完整刷新、其余产业/物品和shortageCountering费用来源、完整sector经济组和按原版阶段/惰性初始化的任务运行器、月度账务。
3. 接权威市场快照及真实进港交易。Corvus依旧只是定义数据，不伪造可交易库存或freshness；规则锁/存档未迁移。
4. 原版布局/交互UI对照、殖民地/势力与自建势力、任务/战斗结算、多人生涯全链路。用户使用电脑期间不占桌面，原版实机验收待许可。

这些计算模块可被后续规则服务替换，但当前没有把局部来源核验误报为整个生涯模式已实现。
