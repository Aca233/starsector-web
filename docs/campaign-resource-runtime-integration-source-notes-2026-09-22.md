# 资源生命周期实际接线（0.98a-RC8）

- 原版证据：BaseIndustry.advance/finishBuildingOrUpgrading（553–595）、Farming.apply/isAvailableToBuild、Mining.apply/setSpecialItem（142–149），以及本轮 resource-lifecycle 和 resource-item-admission 对照文档。
- 预期：同一个市场完整 Memory 推进故障；Farming/Mining 走真实 Base 帧；普通完工续同一个建造队列；准入读取原版资源条件及 water 行星类型；财务/移民/供需按原版顺序。
- 当前差异：已有 live 商品 helper，但尚无 Runtime 资源对象身份、帧选派与队列分支。人口改由市政真实 apply 接动态统计，禁止只在旧循环末尾追加。
- 本轮接线：资源 row/entry/finances/special 同图保存，旧 checkpoint 缺字段不可从 loadInputs 回填；恢复时验证 Memory 归属。新增人口三项统计只从原 XML 的 DynamicStats 读取。
- 验证：一次类型检查、改动 lint、既有 scheduled economy 场景；覆盖实际安装和重应用、自然帧与队列，不冒充连续世界或 UI。
- UI：本轮没有改动布局，用户原版截图约束不变；原版实机/视觉测试待授权，不操作桌面。plasma 视觉 setter 没有实际服务时拒绝，不能用记录回调冒充呈现完成。

追加证据：obf Market.java804–814 的 getCommodityData 只访问/创建市场商品；CommodityOnMarket.java262–264 的 getAvailable 只读缓存stat，BaseIndustry.java720–742 的短缺扫描不构造全局网络。Runtime五处readCommodityAvailable因此改为当次读取真实市场缓存；modifyStability中的getCommodityMarketData仍在原时点触发全局网络。人口ships使用同一市场句柄先available再cachedMaxDemand，缺商品构造数据明确拒绝。

整合补充：人口普通无物品apply/unapply纳入市政dispatcher，三项招募统计真实捕获；Misc.getNumIndustries复用队列实际候选构造，保留升级候选的随机构造副作用。管理员字段读取在人口modifyStability之后；ships只读市场缓存。资源Memory/entry/finances/special同图，混合队列会继续实际创建mining/refining。plasma默认视觉服务已接真实OriginalCampaignPlanet spec→graphics/cache应用；当前行星引用未恢复到共享world时明确拒绝，不把“缺行星对象”当原版null。

集中验收通过：tsc一次、24文件lint零警告零错误、既有shared scheduled economy场景1326.9059ms，日志 C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-runtime-chain-1790080442411.log。只读/逻辑及CPU视觉模型范围；未启动浏览器或原版，未提交发布。
