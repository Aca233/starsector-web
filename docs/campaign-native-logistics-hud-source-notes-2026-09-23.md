# 原生航行后勤HUD接线（0.98a-RC8）

## 编码前最小对照
- 已查看本机原版截图 artifacts/native-cargo-ctrl-overload-20260920.jpg（1920×1080）：原版左下展开货舱HUD，星币/补给/船员最低需求/陆战队/货舱、人员、燃料三容量条/CR/修复比例/修理天数/传感器两栏，不能改成卡片。复用已经源码对照的LogisticsHud.css原版资源和位置，不另造布局。
- coreui/Objectnew.java:88–160布局/展开，258–309非封存成员平均CR和平均maxCR（显示范围固定100），327–346按HullSize权重的min(平均船体,平均装甲)，369–382真正正在修理时的剩余天数，404–463容量，497–562各资源，689–702显示传感器值（不是另算探测距离；检测轮廓下限0，简单难度玩家+500）。
- campaign/fleet/RepairTracker.java:404–407,439–440；FleetMemberStatus.java:415–422,533–548；FleetMember.java:489–490；LogisticsModule.java:117–132,271–278；FleetData.java:1036–1043。Misc.getSizeNum权重frigate/fighter/default=1、destroyer=2、cruiser=3、capital=5。
- 真实舰队状态已有原版NativeLogistics/NativeRepair/MemberStats；不能调用旧临时舰队stats重算，也不能切global playerFleet替代第二舰长。cargo.credits是这支舰队实际账户，不能拿global玩家资金塞给所有人。
- getter有懒初始化副作用：getOriginalMemberStats与originalNativeMemberStatus。HTTP读必须不改变checkpoint：只在当前已sync且stats current时求依赖数值；用浅拷贝成员承载原版status=null的可证明默认惰性创建，不重新计算真实舰队或猜缺失历史。尚缺数据逐项null/明确missing，不拿0冒充。

## 当前差异→实施
旧LogisticsHud仅旧临时世界使用，部分行是未知占位；NativeCampaignApp完全没显示后勤。增加私有原版HUD投影和专用原生展示，复用资源/样式；真实帧或货物交易后的session刷新更新。货物窗口展开，正常航行收起；未接货舱/舰队页面的点击保持禁用，不加假回调。完整航速条、完整原版tooltip/闪烁/滑动动画仍另有依赖，不能宣称完全等价。

## 验证方法
在现有native personnel场景验证数值/封存/装甲权重、读无checkpoint变更、两舰长私有账户与数据不串线，接同一真实SQLite/HTTP页面显示和帧后更新；一次集中类型/lint/相关场景，1920×1080真实页面截图检查左下位置和遮挡。原版实机交互待许可，不动桌面。

补查：FleetMemberStatus.ShipStatus.hasNoArmorData():518–530把小于4×4或首行尺寸不符的旧装甲缓存视为无装甲数据，HUD按1处理，但不改权威缓存；数值夹具使用真实有效4×4网格。getCR经RepairTracker应用缺员/override，不直接显示裸tracker.cr。货币新增字节一致orbitron20aabold.fnt/_0.png，传感器分组数字用DecimalFormat默认HALF_EVEN。

## 实施与验证结果
- 新增OriginalNativeLogisticsHud.mjs/.d.mts、NativeLogisticsHud.tsx/.css，接入projectNativeDevelopmentPlayer和NativeCampaignApp；私有capability增加native-owned-logistics-hud，披露范围明确为controlled-fleet-state-and-open-loot。Cargo账号/资源只取该dataRef自身；没有全局玩家切换。
- 展示星币（原版orbitron20aabold新字体）、补给/日消耗、船员/最低需求、陆战队、货舱/人员/燃料容量、平均有效CR/平均上限、船体装甲加权修复比例、修理天数与传感器修正值。正常航行收起、实际loot窗口走展开分支。无货舱/舰队假按钮回调；航速仪表明确未实现。
- 已同步原版MemberStats才读取维护/CR/修理等依赖；缺失统计返回null和限定missing键，不把未知当0，也不在HTTP读里sync、初始化权威status或修改RNG。未同步时货舱占用和容量也未知，而非拿旧缓存冒充当前数值。
- 集中tsc-b退出0，9文件lint退出0，一个既有native personnel场景1通过0失败（84578.6311ms，总85138.0088ms）。包括原有SQLite/Worker/回滚/权限及探测音效链。首次即通过，无全套。
- 同一真实SQLite→HTTP→NativeCampaignApp无头页面：自己的58,580星币显示，另一舰长1,234,567不披露；原版货币位图字体就绪，左下compact在1920×1080下为x0/y821/280×224；真实host帧prepare扣1补给并提交后HUD随revision3会话刷新显示对应库存。这里是可信夹具的实际帧事务，不冒称正式自动世界或自然经济扣费。
- 已实际查看artifacts/campaign-native-logistics-hud-1920.png。黑底无背景synthetic地点，不是正式星区；与既有原版截图检查区域、顺序、资源风格，没有声称同状态像素等价。本轮原生UI验收为compact；展开分支资源/CSS沿用既有审计，但未新开loot页面补拍展开态。
- 集中场景启动后的源码复查发现旧小装甲缓存行为并修正；最后仅定向验证有效4×4=.25装甲、无效1×1按原版视为无装甲、读取不改变任何原数据、未sync容量/CR不显示旧值，退出0；2文件lint定向复查退出0。永久场景相应断言已更新，没有再跑85秒场景。日志artifacts/campaign-native-logistics-hud-{types,lint,scenario,boundaries,lint-final}.log。

## 仍未完成
航速/燃料日耗仪表、完整原版tooltip与闪烁/滑动/CR条着色、同状态原版实机验收、原生普通货舱/舰队页导航未齐；CSS条形沿用既有近似实现，不是完整GL绘制移植。自动世界/独立多人上下文/正式开局仍未开放。readyForAuthority=false与simulation.status=unavailable保持。无子代理、无桌面操作、无暂存提交/推送/打包/发布。
