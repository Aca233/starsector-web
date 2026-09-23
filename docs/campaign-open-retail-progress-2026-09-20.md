# 开放市场资源库存生命周期进度（2026-09-20）

本轮补资源补货、库存超额减少及权威计时；**没有完成整个市场经济、市场UI或生涯模式**。前置对照见 campaign-open-market-stockpile-native-audit-2026-09-20.md。全部工作为本地文件、Java方法测试与后台无头测试，没有使用桌面、原版窗口、键鼠或子代理。

## 规则实现

- OriginalOpenMarketStockpile：原版OpenMarketPlugin基础上限、按实际submarket **specId**/市场ID/月份的Java随机系数、稳定度系数与两次整数截断；按BaseSubmarketPlugin规则补充/减少库存。
- 对同市场/子市场/月的各商品重复使用同一随机种子的首个随机数，不把commodityId混入零售补货种子。与已有月度定价的商品种子用途不同。
- 原版DEFICIT常量-0.2前还有减号，保留原式，不擅改成常识上的负贡献。测试夹具available6/supply5/demand4/shipping5、补给econUnit750的基础上限为2325。
- 正常低库存按limit/30每天补充，超额按(current-limit)*2/30减少，超过限额时钳回；违禁品不补充，但不是瞬间全部清零。nonecon/meta不执行资源补货，已有内容保留。
- 进入交互前才按累计天数刷新并清零计时；平时每个权威帧仅增加sinceLastCargoUpdate。保留float逐帧累加，以及累计天数→秒→天的原版两次取精度。
- 使用CargoData原版资源小数行为：新栈不足1不创建，移除后不足1删除。当前库存字典只覆盖单资源栈≤1,000,000范围，超限明确拒绝；不以合并计数冒充多栈float行为。要修改的库存/计时必须保留实际float值，不能悄悄把未知精度输入规范化。
- BaseSubmarketPlugin的资源cargo默认partials=null；检索到initPartialsIfNeeded调用属于玩家/舰队，不把玩家库存隐藏余量逻辑混进开放市场补货。原生oracle实际抽取CargoData.addItems/removeItems/getQuantity及CargoItemStack的数量方法。

## 权威运行链路

新增可替换服务retail（reference.open-retail0.1.0）。独立扩展reference.open-retail:<marketId>保存atTick与各子市场的specId、sinceLastCargoUpdate和来源说明。

1. system命令market.capture-open-retail：payload为marketId/submarketId/specId/sinceLastCargoUpdate/source。必须显式提供已知计时；新原版子市场可以依据源码提供31，旧库存不能隐式加31。只能新增未捕获子市场，不能重置已有计时。
2. world.advance调用所选retail.advanceFrame；每帧只推进已存在计时扩展，不创建市场，不改商品/价格/入港许可/asOfTick。扩展atTick与权威时钟一致；整个步进批次只写一次实体版本。更新放在当帧舰队规则之后，防止舰队的tick-start视图读到下一帧计时。
3. system命令market.refresh-open-resources：payload为marketId/submarketId/asOfTick/stability/commodities/source；每条商品输入严格为commodityId/shippingGlobal/available/maxSupply/maxDemand。要求完整且有序覆盖已解析市场中的经济商品，不允许只传想刷新的几种，也不允许传inventory。
4. 刷新要求市场、经济快照扩展、计时扩展、日历扩展的版本；asOfTick必须当前，月来自日历服务。库存读取权威快照，违禁品读取快照判定；不由调用方另传。
5. 一次SQLite事务更新market版本、快照内零售库存与retail计时清零，保存一个事件/收据。刷新失败或outbox失败不会留下已生成货物或已清零计时；重试及重开只执行一次。
6. 现有玩家报价/买卖使用生成后的真实权威库存。刷新与玩家买卖竞争时旧版本拒绝，不覆盖已售出的库存。重复同tick刷新（计时0）不会再补一批货。

**集成边界**：capture/refresh目前是可信解析器的system桥，不在玩家HTTP白名单中，客户端不能伪造产能或刷货。真实产业/运输/稳定度/准入解析器和玩家进港UI尚未完全接线，用户点击市场还不会自动执行完整原版进港流程。上游必须在当前tick真实解析经济；本轮没有创建Corvus库存或把测试数据发布到正式星区。经济快照过期仍拒绝交易/刷新，绝不仅改asOfTick。

## 扩展所有权：保留保护并允许显式委托

接线曾被既有Kernel的EXTENSION_OWNER正确拦截：retail不是market扩展所有者，simulation不是retail扩展所有者。未删除保护，也未放行所有system写。

- 新增可选extensionWriteGrants，必须由**被写扩展的所有者provider**在元数据中声明：service、必需capabilities、精确commands；禁用通配符、空合同、重复/未知字段。
- 只有system主体、实际选中的对应service/命令、能力全部满足才可跨命名空间写。玩家、有相似前缀的另一命名空间、错命令、错service、缺能力、只有写方自己声称授权都不允许。
- reference.market只把market.refresh-open-resources授权给具备native-open-resource-refresh的retail；reference.open-retail只把world.advance授权给具备world-clock-writer的simulation。
- 授权进入不可变规则锁；修改/撤销授权不接受旧锁。它是Web模块接线合同，不是原版单机机制，也不是对不可信插件代码的沙箱。
- 默认规则reference.cooperative0.15.0，market0.3.0、simulation0.5.0、retail0.1.0。没有重写/删除用户存档或静默迁移。

## 验证

- 新增open-retail测试14项、extension-grants测试4项、simulation替换规则时序测试1项；定向合并39/39通过，日志artifacts/campaign-open-retail-final-targeted.log。
- 提取原版OpenMarket.getBaseStockpileLimit/getStockpileLimit、BaseSubmarket资源刷新/advance、CargoData实际add/remove/getQuantity及CargoItemStack数量方法，由javac编译后比较输出：**320组库存/上限**逐float位一致，另**4种帧率×10,000帧计时**一致。周边市场/运输/全局时钟是最小桩，证明方法级规则，不证明整个原版宇宙已运行。
- SQLite实际验证显式capture、按帧推进、分批一致、原子刷新→实际购买、零时间重复刷新、过期快照/版本、与卖货竞态、outbox故障回滚、重新打开幂等。
- 实际Worker验证capture→refresh→world.advance；认证HTTP对两个system命令均返回403。报价/库存不包含客户端自报经济值。
- 全项目tsc -b、严格campaign类型与新增不可变retail输出负例通过；变更范围oxlint --deny-warnings通过。
- 完整campaign测试：**515项，510通过，0失败，5个可选原版探针跳过**。单并发日志artifacts/campaign-open-retail-regression.log。不是整个仓库所有功能的验收。
- 独立campaign QA构建通过（publicDir:false），不是发布包。UI没有新增或改版，既有无头界面兼容回归单独记录；不能拿这些测试声称市场视觉或进港交互完成。

## 剩余工作

真实产业/条件/供需网络/贸易影响到期/运输/稳定度/准入的统一经济推进；stocking与实际进港流程连接；舰船/武器/联队/特殊物品库存；黑市后果及军用/仓库等插件；跨子市场总确认和原版市场UI。更广的星域/传感器、任务/战斗结算、势力/自创势力/殖民地及生产联机仍未完成。

本轮未暂存、提交、推送或打包发布，保留其它任务的LAN/设计器/Steam等变更。

## 最终既有界面回归

显式headless:true执行HUD、Ctrl、Shift、货舱预览、普通转移五份既有场景，全部通过、页面运行时错误0。包含1024视口、晚回包撤销、幂等重试与过期草稿；未更改市场UI，因此这不是市场视觉验收。日志 `artifacts/campaign-open-retail-ui-regression.log`，结果 `artifacts/campaign-open-retail-headless-results.json`。执行器finally关闭全部测试浏览器、上下文、Worker和HTTP网关。收尾暂存区检查为空。
