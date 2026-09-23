# 原生制造、交付与月报链（0.98a-RC8）

## 原版证据 → 行为
- CoreScript.java:843–1066：持久 prodRandom；先获取汇集点/仓库；账簿净额与当前余额限制月产能；固定初始数量权重选择订单；持久累计生产值；临时玩家舰队与原版 inflater；实际货物和舰船；赠送补给/燃料/船员；逐行业独立 seeded Random；实际入库、0.5 CR、排序、生产情报。
- FactionProduction.java:410–438 的 baseCost 是生产支出；不能用 UI costMult 的 unitCost 代替。所有 float32/int 溢出顺序照源码。
- ProductionReportIntel.java:28–65：有序按标题 Cargo 表；每批初始 mothballed roster；报告关联真实数据、10 天 duration（实际清理由子类的至少 30 天门槛约束，见下文）。数据表空必须同时检查货物和船。
- DefaultFleetInflater.java:225 起、CampaignFleet.java:213–224：空舰队仍有 autofit 随机选择、蓝图/规格检查、Memory、fleet-inflated 监听与 inflated 状态；不以空回调冒充。

## 当前差异 → 修改
- 上轮仅价格/产能与无仓库月结；本轮移植整个 CoreScript 制造程序和月报收费，再连接现有真实 Cargo/舰队/情报对象。
- 不猜旧 prodRandom 历史；新世界可显式传原生随机种子构造，旧世界必须完整捕获或绑定原状态。缺真实装配/生成服务时整笔事务拒绝，不完成假订单。
- 工厂、装配、行业产物与情报注册只允许真实同步服务；不得注入空函数放行。新增程序不是全生涯完成的证明。

## UI 和验证
- 本轮先实现权威数据链，不改 UI 布局；原版制造界面/操作实机待许可，不开可见窗口。
- 复用已有合成 headless checkpoint 开发；整块完成后集中类型、改动 lint 和一个相关既有场景，具体失败才定向复查。不测试私人存档、不暂存提交/发布。

## 生产报告实际实体与寿命（本轮续接）
- ProductionReportIntel.java:57–64、260–264；FleetLogIntel.java:71–96；BaseIntelPlugin.java:390–402：timestamp 为实际首次可见时间；未可见时使用当前时钟计算经过天数，正常为 0；原生时钟 timestamp=0 哨兵行为也保留。构造 duration=10，但报告自己的前置判断要求至少 30 天且不重要，再执行 FleetLog 的 ended/duration 判定，不能在第 10 天清除。
- 实现真实生产报告子类，保留汇集点市场、有序批次 Cargo 与成员的实际对象，不以 DTO/空情报回调代替。接入现有 IntelManager 的时间戳、消息点击目标、过期清理、循环 checkpoint。未知 FleetLog removeTrigger 分支仍明确拒绝，不能照通用 BaseIntel 清除。
- 本轮不新增或宣称完成情报 UI；图标/标签来源为 settings.json 的 intel.production_report、Tags.INTEL_PRODUCTION/INTEL_FLEET_LOG，原版实机布局待许可。验证使用原有短月结场景，新增真实管理器、29/30 天边界、重要标记和共享批次存档断言。

### 移除交付占位依赖
- CoreScript.java:962–970 + HullVariantSpec.java:454–461/1439–1442：配装费用按非空非内置机翼、武器 HashMap 顺序逐项计算，不把内置武器算进去。新增从当前真实变体读取的默认计价，未知规格仍拒绝。
- CargoData.java:172–181：isEmpty 仅看 NULL 类型，不按 size>0 推断。新增真实货舱空判断默认。
- RepairTracker.java:299–301/447–461：解除封存先恢复 crPriorToMothballing，状态变化时调用真正 updateStats 并置 FleetData needsSync；随后制造交付 setCR(0.5)。不再以直接改两个字段冒充实际 setter。

## 本轮结果与验收（2026-09-23）
- 实际新增 OriginalProductionReportIntel；制造默认调用 NativeCampaignRuntime.addNativeProductionReportIntel，不再要求情报录制回调。报告与 IntelManager/消息目标、实际汇集点、批次 Cargo 保持共享身份；原生 FleetData 引用须能在当前 roster 中解析。
- 显式支持的生产报告与普通 BaseIntel 分派分开；未知任务/未知 removeTrigger 不冒充已实现。10 天不移除，30 天起才按 FleetLog 判断；重要标记、ended 的判断顺序、未可见队列及 timestamp=0 哨兵均验证。
- 默认配装估值排除内置项；NULL 类型货舱判空；真实解除封存先恢复 CR 并更新 stats/同步标记，再由交付设 CR=0.5。覆盖当前真实变体，不使用订单 UI costMult。
- 集中验收：tsc -b 退出 0；13 个本轮改动代码/声明/场景文件 oxlint 退出 0；既有 saved monthly account tree 场景 1 通过、0 失败，场景 422.196ms，总 923.2252ms。日志 artifacts/campaign-native-production-report-{types,lint,scenario}.log。
- 场景中：报告注册、时间戳、消息意图与点击目标、货舱循环存档、期限、重要标记、成员 stats 更新是实际实现；制造临时舰队/inflater/行业输出仍有明确契约录制适配器，不能据此宣称自然制造世界已经端到端通过。
- 仍缺：真实生产临时 CampaignFleet 重载/自动装配器、实际可变 hull-to-variant 列表、行业产物世界适配器（含 TechMining）、旧仓库完整 FleetData 图与旧 CoreScript prodRandom 导入；生产情报 UI/交互及实机视觉核验未做。readyForAuthority=false / simulation.status=unavailable 保持不变。未暂存、提交、推送、打包或发布生涯内容。
