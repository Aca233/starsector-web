# 原生殖民地月结与制造计价接线（0.98a-RC8）

## 原版证据 → 预期行为
- `FactionProduction.java`（starfarer_obf/com/fs/starfarer/loading/specs），142–185、410–438：月产能对玩家所有殖民地取 ships 的 min(maxSupply, available)，逐项 float32 累加，最后 custom_production_mod、Java round/int；单位价、整单价遵守 int 乘法溢出及浮点精度。武器价格委托可替换，制造延迟不代表交付。
- BaseIndustry.java:904–906 的 getCurrentName 返回 spec.name；原版 econ 下无子类覆写。从当前 industries.csv 提取名称，只为已支持的原版插件提供默认名称，未知插件仍拒绝；外部 getter 优先。
- CoreScript.java:844–853；Misc.java:4307–4312：无汇集点或无 storage submarket 立即返回；存在 storage 则 getCargo 惰性创建，与 playerPaidToUnlock 无关。仓库存在但制造服务缺失不得假装订单完成。
- CoreScript.reportEconomyTick / reportEconomyMonthEnd：原行业收入/维护、出口与危险津贴按当前市场入账，再结算真实 credits，失败由宿主事务回滚。
- settings.json：productionCostMult=1、shipProductionCostBase=1000、productionCapacityPerSWUnit=25000；价格规格复用带来源的 reference-storage。

## 当前差异及本块修改
- 当前行业名强制外部回调，使有殖民地的默认月结中断；补原版默认 getter。
- 制造入口仅支持无汇集点早退；补无仓库分支和实际仓库 getter，不伪造制造、入库、随机数或通知。
- 补现有原生 runtime 上可调用的制造单价/订单总价/当前月产能；采用当前生产统计与玩家 modifier，不用缓存的市场规模或手写固定产能。
- 完整 CoreScript 制造交付、DefaultFleetInflater、持久 prodRandom 与 ProductionReportIntel 仍待接线，不能宣称完整制造完成。

## 界面/验证
- 本块不更改 UI 或布局；不占用桌面、不开可见窗口。原版实机操作待许可，截图不能证明未展示的制造交互。
- 先扩展现有月结/原生宿主场景，再集中一次类型检查、改动 lint、相关既有场景。核对原版边界数值、殖民地自然月结/资金、checkpoint 身份和失败回滚；不运行全套。
- 保持 readyForAuthority=false / simulation.status=unavailable；生涯更改不暂存、不提交、不发布。

## 定向修正依据
- 首次集成场景发现 current character dynamic value 复用了商品数量 getter 的 65,536 上限，会拒绝正常 225,000 月产能；制造金额改用原版 StatBonus.computeEffective 的 float32 顺序，不扩大商品 getter 的业务范围。
- DynamicStats.java:35–42 的 getMod 会注册真实共享 StatBonus；这里不同于不分配的 getValue。运行时复用原生动态目标工厂，保留 dynamicRefs/targets 身份，不用裸对象替代；已有 modifier 的重复查询不变更历史。

## 已落地接口
- NativeCampaignRuntime.readNativeProductionUnitCost / readNativeProductionOrderCost / readNativeProductionCapacity：读取当前订单、原版规格和当前玩家市场统计；不会完成订单或扣费。价格规格与武器委托保留显式可替换服务。
- NativeCampaignRuntime.nativeStorageCargo：真实 Misc.getStorageCargo 分支，缺 storage 返回 null；存在但尚未建 cargo 则惰性建立共享 cargo/mothballed，不以付费解锁状态代替存在性。
- 默认殖民地月结行业名字来自生成数据中的 30 项原版名字；当前生命周期新建/升级行业使用当前实例 objectRef，不绑定到已经被移除的旧行业。未知原版外插件仍需真实 name getter。
- DevelopmentWorld 的 frame factory 类型收紧为 NonNullable，与宿主运行时必须提供真实 options 对象一致。

## 验收过程记录
- 第一次场景定位并修复金额误用商品统计上限的问题（见上）；第二次在新断言处发现合成玩家已持有空的 custom_production_mod，测试不能假定它缺失。已改为核对并复用真实已有 target。两次均未扩大为全套测试。

## 本块最终验收（2026-09-23）
- 类型检查退出 0；改动 lint 退出 0。仅对具体失败进行了定向修改及复验。
- 同一既有 personnel/真实 SQLite 宿主场景最终 **1 通过、0 失败，87.31 秒**（总 87.99 秒）；全部 UI 标志为 0，无桌面/键鼠/可见窗口。
- 显式合成世界中的两个玩家殖民地、已知汇集点、无 storage 子市场：不传行业名或空制造回调，自然帧触发原生月结，按真实当前行业/出口数值校验账单增量、13.25 危险津贴归零与扣费、资金净额、通知一次及 checkpoint 恢复；制造队列保持未交付。这不是正常带仓库殖民地的完整制造验收。
- 按原版规格核对 Hermes 5,000、Broadsword LPC 6,000、Light Machine Gun 100 基础制造价；订单整单舍入、武器委托优先级、Java int 溢出及 20 亿早退已覆盖。
- 当前市场 ships 供应/库存 + 玩家 50% 修正产生 225,000 月产能；供应短缺后实时降到 112,500，恢复 checkpoint 保留同值与共享修正目标；没有用市场规模写死产能。
- 未付费仓库照原版可返回真实共享 cargo；首次真实惰性创建 mothballed。带仓库到达未实现制造分支时，SQLite checkpoint 完全不变，没有订单伪完成、误扣款或半个新月份。
- 日志：artifacts/campaign-native-colony-production-types-final.log、lint-final.log、test-lint.log、scenario-verified.log。前两次失败日志保留，不覆盖事实。
- 完整制造/自动装配/实际产品入库/生产报告、正式自动世界与多人上下文仍未齐；整体目标 active。未暂存、提交、推送、打包或发布。

## 后续整条制造交付必须保留的已核实语义
- CoreScript.java:843 实际字段初始化为 protected Random prodRandom = new Random()；不能把未捕获历史当成已知 null 或每月重建 seed。875 的 null 回退不是一般缺失历史的许可。
- CoreScript:917–965 的订单选择权重在 picker.add 时读取数量，减量之后不重算该项权重；SHIP 变体列表空时先扣生产值、加入 id_Hull 后 continue，尚不删除订单。制造支出用 getBaseCost，不是 UI 的 costMult 单价。
- 即使只有武器/LPC，依然创建临时玩家舰队并调用 inflater。DefaultFleetInflater:225–245 在成员循环之前就消耗其独立 seeded random.nextFloat 来决定 UPGRADE，不能把空舰队的 inflate 当成任意空回调。
- CoreScript:998–1010 给每个玩家行业都先消耗 prodRandom.nextLong，再 Misc.getRandom(seed,11)，包括 generateCargo 返回 null 的行业。
- ProductionReportIntel.ProductionData 使用插入有序的按标题货物表，getCargo 同时初始化玩家 mothballed fleet；isEmpty 同时检查货物与舰船。报告持有真实批次引用；接下来需要与仓库、月报和情报存续一起接线，不能仅实现清单展示。
