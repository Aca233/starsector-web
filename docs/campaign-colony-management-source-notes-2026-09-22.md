# 所属舰长的殖民地只读管理投影 — 2026-09-22

## 范围与修改前最小对照

基线为本机 Starsector 0.98a-RC8。本轮仅新增 `server/campaign/native/ColonyManagement.mjs/.d.mts` 与本文；已读 AGENTS.md，不改 Runtime、DevelopmentWorld、协议、客户端或测试，不运行检查、不操作桌面或提交发布。

| 原版证据（相对 ../decompiled） | 预期行为 | 当前投影边界 / 验证方法 |
| --- | --- | --- |
| `starfarer_obf/com/fs/starfarer/campaign/command/OutpostListPanel.java:105–112`；`OutpostItemRow.java:146–195` | 综合管理表头名称、环境、位置、稳定、规模、净收益、科技、管理员；真实市场名字、稳定/规模及管理员 | 仅投影可信 host 明确绑定的 marketIds，绝不以 faction/playerOwned/队友推断所属。原版表格布局由界面代理核对；本轮没有原版截图或实机交互证据，不把旧 Web 图当原版图。科技总览未移植，返回 null + blocker。 |
| `starfarer_obf/.../econ/Market.java:581–600,1259–1308`；`CommodityOnMarket.java:113–118` | hazard 为 modifiedValue 原始倍率；稳定先限 0..10 再 Math.round；收入=产业收入+出口，净收益还减产业维护、短缺补给、移民激励；无 commodityMarketData 时出口为 0 | 用现有纯 stat resolver、现有缓存 peek 与纯出口公式，不创建 network。区分 industryUpkeep 与 totalExpenses，未知短缺费用不能报零或把维护费冒充总支出；所有未知为 null+字段 blocker。 |
| `starfarer.api/.../population/CoreImmigrationPluginImpl.java:189–218` | 激励月费由当前 hazard/size 计算，不是已累计 incentive credits | 复用 originalImmigrationHazardEffects，未启用时零；不开启人口推进。 |
| `starfarer_obf/.../econ/Market.java:337–350` | getAdmin 可能构造 Person、切换玩家管理员和 refresh | GET 不调用该变更 getter；只读取已绑定 personnel.adminRef 对应的实际人物。尚需创建或默认管理员惰性转换时不制造人物，给 blocker。只输出姓名/头像/AI core/是否玩家等白名单。 |
| `starfarer.api/.../econ/impl/BaseIndustry.java:434–441,811–817,1938`；`../starsector-core/data/campaign/industries.csv` | 普通产业 currentName/image 默认来自 spec；真实建造进度来自实例 buildProgress/buildTime，失能时 UI 进度为零 | 内嵌由原版 CSV 逐项读取的 spec title/icon，不假称动态 getCurrentImage 覆盖已全实现。产业进度只读取同图 active lifecycle row 与 entry 的身份绑定；不拿 spec buildTime 替代历史实例。 |
| `starfarer_obf/.../ui/marketinfo/IndustryPickerDialog.java:182–187` | picker 构造候选后执行真实 isAvailableToBuild | GET 不运行构造器、不消耗随机数、不凭标签列可建设项：buildOptions=null，标明需显式 inspect-build 事务。 |
| `starfarer_obf/.../ui/marketinfo/intnew.java:238–281,373–432` | 点击待建项进入移除/交换模式；再点自身退款移除，点另一项交换 id/cost，右键清模式；不是 up/down 或虚构确认弹窗 | 投影实际 queue objectRef/id/index/cost。canCancel/canSwap 只有 host canConstruct 返回 null 且队列完整唯一才可开放；变更命令仍须主线重新授权和校验，投影不是事务执行。正在建造的产业不混进队列。 |

## 公开契约与安全边界

- `projectNativeColonyManagement(runtime,{marketIds,canConstruct?})`：canConstruct `(marketId)=>string|null`；null 仅表示主线已核实本次绑定所有权/付款上下文，string 原样作为明确 blocker code。省略则禁用。不可将其理解为任何特定产业的可建性评估。
- 顶层 `schemaVersion:1, scope:'native-colony-management', rows, blockers`；rows 保持显式请求顺序。空 marketIds 得空 rows。旧 world 的 colonyControllers=null 由主线返回 colonyManagement=null，不传成空列表。
- 控制器由主线可信 host 建立，financeDataRef 必须对应实际 playerEconomyState().fleet 才允许经济 mutation；否则 `NATIVE_COLONY_FINANCE_CONTEXT_UNAVAILABLE`。本模块不接触/改写这些授权绑定，也不替换全局 fleet。
- 不读取私人存档、checkpoint、loadInputs 或 runtime.snapshot，不返回源捕获、Memory、货舱、联系人、舰队、共享图、其它市场或引用它们的内部对象。仅构造新的 JSON 标量/白名单数组并冻结。
- 位置当前仅有可靠 hyperspace 坐标和已知 planetType；没有系统名就 null，不把原版单位猜成光年，不虚构所属星系。
- 原版 spec title/icon 用于可核实的标签/图标，未评价未知/模组 plugin 的动态名字、大小/气态行星图标覆盖。

## 集中验收建议（本轮不执行）

1. 显式绑定 A 时输出只含 A；空绑定空 rows；未知绑定仍保留该行的 null+blocker，不加入其它市场。不回传共享对象，修改投影不能改变 Runtime。
2. 投影前后共享 Memory、RNG、人员 roster、UID、commodity cache 与构造队列均不变。不可调用 instantiateIndustry/getAdmin/network getter 来取得展示值。
3. 当前 mutable stat/产业财务/生命周期/队列变化能反映在下次投影；缺失任一费用、人员或生命周期历史不被默认为零/完成。
4. 主线付款 blocker 原样进入逐市场 mutationBlocker；buildOptions 始终未评估，不以可付款暗示可建设。客户端按原版待建项的移除/交换模式消费 canCancel/canSwap，但服务端每次命令仍重新校验。

未运行 tsc、lint、测试、浏览器或原版实机；这是源码核对及只读数据投影，不是完整殖民地玩法/UI 验收完成声明。

### 队列工期补充

已核对 intnew.java:285–296：待建项显示 (int)spec.getBuildTime()，故 queue.buildTimeDays 由同份原版 CSV 明确 build time 列截断；空列不猜默认值，返回 null+blocker。这与在建实例的 construction.totalDays 分开。逐项 cancelBlocker/swapBlocker 补足单项队列无交换对象的禁用原因；不假造向上/向下操作。

### 建设 inspect 集成补充：hiddenOverride capture（原版证据先行）

- `BaseIndustry.java:82,1566–1576`：`Boolean hiddenOverride = null`；setHidden(false) 写 null；isHidden 在 override 非 null 时返回其值，否则 false。`CoreLifecyclePluginImpl.java:1936–1948` 的 BaseIndustry 别名未改名 hiddenOverride，按原名 XML 子元素抽取。
- 当前 extractor 只有 buildCostOverride，hiddenOverride 尚落在 otherFields。最小修改：新 XML capture 总是显式写 `hiddenOverride:boolean|null`，未保存子元素表示 Java null；已有 true/false 严格解码，非法文本拒绝，并从 otherFields 移除已解码字段。
- 声明为 `hiddenOverride?:boolean|null` 兼容旧 JSON：缺属性是未捕获/未知，绝不能以 `saved.hiddenOverride ?? false` 合并成已知可见。主线须先 `Object.hasOwn(saved,'hiddenOverride')`，确认已捕获后才可解释 null 为原版 isHidden 的 false 分支。本轮不修改 Runtime/lifecycle，不补旧捕获默认值。
- 集中验证建议：XML omitted/true/false/非法文本及旧 capture 缺属性；本轮仅代码阅读与编辑，不运行验证。
