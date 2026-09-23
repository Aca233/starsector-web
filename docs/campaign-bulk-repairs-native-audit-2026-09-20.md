# Fleet core UI 批量暂停／恢复维修：有边界原版审计

日期：2026-09-20。结论级别：**原版本地源码／字节码静态审计 + 用户截图观察 + Web 纯函数内存探针；真实原版运行验证：未验证。不能据此宣称已经原版等价。**

> 以下审计段落及输入指纹保留编码前快照；2026-09-20 后续已实施的修正见文末及实现进度。不要把历史差异再次当作当前源码状态。

## 1. 范围与证据边界

- 只审计 Fleet core UI 的“暂停所有维修 [Q]／恢复所有维修 [W]”，并沿单舰入口、成员范围、封存状态、维修／CR／补给链做必要追踪。不是整个舰队管理、市场维修、战斗恢复、所有技能／模组或多人权限系统的等价性审计。
- 本次只新增本文；不改功能代码、不改测试、不运行会落库的整套测试、不提交、不推送。工作区原先已有大量修改／未跟踪文件，审计期间也观察到其他文件的变动；没有覆盖、撤销或整理它们。
- 原版参考为本机反编译树、API 源码和安装目录。N12:2–8 标记本机汉化包版本 `2026.09.04`、游戏 `0.98a-RC8`；截图标题同为 `Starsector 0.98a-RC8`。这不是对所有英文原版发行包／用户模组组合的保证，也未证明整个反编译树与当前 JAR 完全同源。
- 下文 `N1:365–381` 等表示第 2 节中**确切文件的 1-based 行号**，不是 Java 类名猜测或 `rg` 的匹配序号。反编译文件中的 Unicode 转义在说明中解码以方便阅读，磁盘源文件未改。
- 截图仅有一个静态时刻；没有本次按 Q/W 的前后对照、存档字段对照或时间推进日志。本文的“源码确定”不等于“原版实机已复现”。

## 2. 确切文件索引

所有路径均为本机绝对路径。长混淆文件名用别名引用，但此处不省略真实路径。

### 原版

| 别名 | 文件 |
|---|---|
| N1 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/coreui/refit/auto/new.java` |
| N2 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/coreui/_.java` |
| N3 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/coreui/i_0.java` |
| N4 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/coreui/OOoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO_cfr_32.java` |
| N5 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/CampaignFleet.java` |
| N6 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/FleetData.java` |
| N7 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/RepairTracker.java` |
| N8 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/FleetMember.java` |
| N9 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/LogisticsModule.java` |
| N10 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/fleet/RepairTrackerAPI.java` |
| N11 | `C:/Program Files (x86)/Starsector/starsector-core/data/strings/tooltips.json` |
| N12 | `C:/Program Files (x86)/Starsector/starsector-core/localization_version.json` |
| N13 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/ui/n_0.java` |

### Web 当前实现及现有测试

| 别名 | 文件 |
|---|---|
| W1 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/client/FleetPanel.tsx` |
| W2 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalLogistics.mjs` |
| W3 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalLogisticsQuote.mjs` |
| W4 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalLogisticsStep.mjs` |
| W5 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalRecovery.mjs` |
| W6 | `C:/Program Files (x86)/Starsector/starsector-web/server/campaign/PlayerProjection.mjs` |
| W7 | `C:/Program Files (x86)/Starsector/starsector-web/server/campaign/FleetHudProjection.mjs` |
| W8 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/client/Protocol.ts` |
| W9 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/client/CampaignApp.tsx` |
| W10 | `C:/Program Files (x86)/Starsector/starsector-web/scripts/check-campaign-bulk-repairs.mjs` |
| W11 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/core/Kernel.mjs` |
| W12 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalFleetStats.mjs` |

## 3. 先看 UI：截图究竟证明了什么

已通过 `view_image` 查看用户文件：

`C:/Users/Aca/AppData/Local/Temp/codex-clipboard-a6f03cc9-d29c-4dff-892b-1d4ac1653e5b.png`

可直接观察：

- 当前是 Fleet core 的舰船矩阵与左侧控制栏；左侧两行分别为“每天用于维修的补给 4.4”“完成维修需要的补给 49”。
- 其下为两颗独立横条按钮：“暂停所有维修 [Q]”与“恢复所有维修 [W]”，不是一个根据选中舰状态改变含义的切换按钮。
- 矩阵中可见三艘舰，每艘各有自己的操作图标及 CR／舰体条；三艘在这张图里均显示 CR 0%、舰体 100%。因此“舰体已满”不能推出“不需要恢复”。
- 本图不能证明任何一次点击的目标集合、封存状态、货物变化、按钮焦点或快捷键事件行为；也不能从图中的小色标反推出所有舰船的 `suspendRepairs` 字段。

源码对应 UI：N2:183–187 在 Fleet 页挂载宽 253 的侧栏；N1:93–99 创建这两个按钮并绑定快捷键；N1:115–118、152–158 给出按钮高度 24、两按钮间距 3、它们位于补给统计下方。按钮之后才是闲置军官及自动任命区域。这里只确认相关结构，不声称 Web 已像素级复刻整个页面。

## 4. 原版事件链和作用范围

### 4.1 Q/W 是两个显式设置动作，不是“对当前选择取反”

- **目标舰队**：N1:82–85 构造时保存 `CampaignEngine.getInstance().getPlayerFleet()`。
- **绑定**：N1:96–99，暂停绑定 `oo.\u00f500000`，恢复绑定 `oo.\u00f400000`。
- **暂停分支**：N1:365–373，遍历上述玩家舰队的 `getMembers()`，`isMothballed()` 为真就 `continue`，否则 `setSuspendRepairs(true)`。
- **恢复分支**：N1:375–381，同一集合、同一封存排除条件，设置 `false`。
- **底层 setter**：N7:349–355 只读／写 `suspendRepairs`；API 的公开签名见 N10:83–84。setter 不扣补给、不直接修舰、不立即恢复 CR，也不解除封存。
- **重复操作**：再次 Q 是继续设 true，再次 W 是继续设 false；不会把已经匹配的舰反向切换。原版仍逐个调用简单 setter；Web 跳过已匹配字段属于相同最终标记下的事务实现差异。

这里的遍历没有 `needsRepairs()`、CR 低于上限、货舱有补给、当前选中舰、舰种或“只显示的舰”判断。健康、满 CR 的非封存成员也会记录暂停策略，供以后是否恢复使用。**不可在复刻时擅自缩小为“现在需要维修的舰”。**

### 4.2 确认 Q/W 映射的额外二进制证据

本地反编译树没有在预期长路径下提供这一快捷键类的可用源码定义，不能伪造源码行号。为补齐绑定来源，仅对以下本地文件做了 `javap -p -c`／`javap -constants` **只读字节码检查**，没有启动游戏：

- `C:/Program Files (x86)/Starsector/starsector-core/starfarer_obf.jar`
- `C:/Program Files (x86)/Starsector/starsector-core/lwjgl.jar`

快捷键类完整二进制名：

```text
com.fs.starfarer.title.OoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.OoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
```

证据位置（以下是 JVM 字节码偏移，不是源码行号）：

| 类／方法 | 位置 | 观察 |
|---|---|---|
| 上述类的内部枚举 `$oo`，静态初始化器 | 1542–1563 | `SUBTAB_1` 对应字段 `õ00000`（即 `\u00f500000`） |
| 同上 | 1570–1591 | `SUBTAB_2` 对应字段 `ô00000`（即 `\u00f400000`） |
| 外部类 `public static void Ö00000()` | 1230–1238 | 给 `õ00000` 注册键码 16，三个布尔参数均为 false |
| 同上 | 1241–1249 | 给 `ô00000` 注册键码 17，三个布尔参数均为 false |
| `org.lwjgl.input.Keyboard` 常量 | `KEY_Q = 16`、`KEY_W = 17` | 与用户截图的 Q/W 提示一致 |

所以当前本机参考支持“Q 暂停／W 恢复”。原版走快捷键对象，而 Web 是硬编码 `event.key`；本次没有实测改键、重复按键、输入法、焦点抢占或弹窗遮挡时的行为，不声称两者键盘语义完全等价。

### 4.3 全舰、单舰、列表筛选要分开

1. **全舰目标来自模型，不来自可见行**：N5:1142–1144 的 `CampaignFleet.getMembers()` 返回 `fleetData.getMembers()`；N6:904–907 同步后返回 `membersWithoutNull`。N1:368／376 就是调用这条链。
2. **UI 列表只是刷新目标**：N1:353–361 在动作完成后枚举当前 Fleet 页的行，调用 `updateAllButtonStatus()` 和行对象 `advance(2.0f)`。这不是 `LogisticsModule.advance`，不能解释为“按一次 Q/W 就推进两秒舰队后勤”。模型写入在它之前已经完成，不能拿这段 UI 刷新循环当批量操作范围。
3. **已审查的核心矩阵没有筛选维修目标**：N3:197–219 建行时直接遍历 `fleetData.getMembers()`；单行选择另由 N3:144–153 的 `getSelectedRow()` 提供。批量处理未调用它。滚出视口／未选中不构成免操作条件。
4. **没有证明原版另有维修筛选控件**：用户截图及本次追踪链中未见按舰种／损伤／选中状态筛选维修目标的逻辑。结论是“此批量处理不读取 UI 筛选集合”，不是“全游戏绝无任何过滤功能”。若未来 Web 添加筛选，不能据此把 Q/W 默认限定为筛选结果。
5. **仓储／市场另一侧不是玩家现役成员集合**：N2:204–206 将子市场 `cargo.getMothballedShips()` 作为另一个 UI 数据输入，批量侧栏仍持有玩家舰队。不要把仓库或市场里的舰船也算进“所有”。舰队内部的封存舰又是另一回事，它们在玩家成员集合里，但被显式跳过。
6. **Fighter wing 边界**：批量分支只有 `isMothballed()` 排除，没有 `isFighterWing()` 排除；不能从统计 UI（N1:199 会跳过 fighter wing）反推批量也跳过。这里说的是独立 `FleetMember`，不是把航母配装里的每架战机当批量目标。未做这类遗留成员的实机验证。

### 4.4 单舰按钮与封存不是同一操作

- N4:624–637：维修动作 `case 1` 只对当前行的 `RepairTracker` 取反，并调用其 `FleetData.setSyncNeeded()`；封存动作 `case 3` 才会 `setMothballed(!...)`，随后清除 `suspendRepairs`。
- N4:302–314、371–375：封存舰的单舰维修按钮取消高亮并禁用；非封存舰根据暂停标记高亮。健康舰并没有在这个维修按钮分支被禁用。
- N11:85–91 的原版提示明确写“停止维修和战备值 (CR) 恢复”，并有“目前不需要修理或 CR 恢复”的说明。它不是一键封存／节省全部维护费。
- N7:447–460 的封存 setter 有独立的 CR 与 stats 副作用；N7:130–132 还会在正时间推进时清理封存前 CR 暂存。不能用 `setMothballed` 替代暂停维修，也不能把解除封存概括为永远立即返还原 CR。封存 tooltip 的容量／CR 说明见 N11:73–79。

## 5. 补给、货物、CR 与维修：即时和随时间的影响

### 5.1 点击当下不是“完成维修”事务

N1:365–381 + N7:353–355 只设置标记并刷新 UI；没有预扣“完成维修需要的补给”，没有消耗船员／燃料，没有立即改变舰体、装甲或 CR。恢复 W 也不是付费瞬修。缺少补给不是上述动作分支的禁用条件；库存不足与能否实际恢复在之后的后勤步骤处理。

### 5.2 时间推进时，暂停同时阻断舰体／装甲维修及 CR 正向恢复

- **CR**：N7:135–176。CR 低于上限、有补给且未暂停时才进入 163–168 的恢复分支。CR 已高于当前上限，或者没有补给，仍进入 140–162 的下降分支；暂停不锁定 CR、不防缺补给掉 CR。
- **舰体／装甲**：N7:179–181 要求有补给、需要维修、`canBeRepaired()`；N8:489–494 明确排除封存、暂停和 fighter wing。N7:357–365 委托 `FleetMemberStatus.repairFraction`；N7:404–413 的剩余维修时间同时考虑舰体与平均装甲，N10:92–96 也明确 repairedness 包含两者。
- **实际扣货时点**：N9:45–70 先按时间增量扣 cargo supplies，再逐成员 `advanceCRAndRepairs`。费用包括舰船维护／恢复、crew／marines 和超载等项。
- **不足整步但起始补给 > 0**：N9:58–63 即使耗尽现有补给，当前这一步 `bl` 仍可为 true；不要改写成按补给缺口比例缩短当前步恢复。起始就是 0 则 false（AI 模式是单独分支，不是玩家规则）。
- **暂停后仍可消耗补给**：N9:207–219 的总维护口径仍保留基础维护，只不添加暂停舰的额外恢复消耗；其他超载等费用也没有被 Q 清掉。N9:72–86 的航行燃料计算与该暂停开关分离。

Web 在已支持成员模型内，W2:20、32–37 同样仅规划标记／版本更新；W4:23–33 处理以后步骤的扣补给；W5:33–45 处理恢复／缺补给下降。W12:56–66 的容量和封存维护倍率依据 `mothballed`，不是 `suspendRepairs`。因此不能把暂停当成清空货舱、减少容量或解除封存。上述局部源码相符不证明完整技能／舰型／模块恢复都已等价。

### 5.3 原版两项侧栏统计的准确口径

**A. 每天用于维修的补给**

N1:194–195、210–214 取 `getShipMaintenanceSupplyCost(LogisticsModule.o.cfr_renamed_7)`，不是单纯把 `getRecoverySupplyUsePerDay` 相加。

N9:207–219 的该枚举分支，对符合以下条件的成员计费：

- 非封存；
- 未暂停且 `getRecoveryRate() > 0`；
- `baseCR < maxCR` 或者 `needsRepairs()`。

每个合格成员的贡献是：

```text
getBaseSupplyUsePerMonth(member) / 30
+ getRecoverySupplyUsePerDay(member)
```

基础月耗如何取得见 N9:241–246，额外恢复项见 N9:222–238（只有舰体／装甲需要维修、CR 已满时改用基础 deployment／recovery 参数）。**原版这一行包含正在恢复成员的基础维护份额，但不代表全舰总维护／全货物消耗。** 全部普通舰暂停后这一行可以为 0，实际总补给消耗仍不为 0。

**B. 完成维修需要的补给**

- N1:194 使用 `getTotalRepairAndRecoverySupplyCost(false)`；N9:257–264 委托 N6:1027–1033。
- N6:1030 有精确的 `canBeRepaired`／fighter wing 条件；对于普通舰就是排除暂停、封存舰。合格成员累加 `getRecoverySupplyUsePerDay(member) * getRemainingRepairAndRecoveryTimeIgnoringLR()`。
- N7:430–436 的时间是舰体／装甲与 CR 剩余时间的最大值，并上限截为 1000 天；不是两段恢复时间相加，也不是侧栏每日值乘某个猜测天数。N7:109–117 给出 CR 时间分支。
- N1:196–214 的“不适用”还有独立条件：只看非 fighter wing 成员，若没有任意一个 `recoveryRate > 0`，但又不是全部 `isSuspendRepairs()`，则显示“不适用”；否则显示数值。该判定循环本身没有排除封存舰。不能将它简化为“没补给就不适用”。普通舰全部暂停时合计费用可为 0，不是固定保留原总价。

## 6. 与当前 Web 实现的差异清单

| 项目 | 原版与当前实现 | 审计判断 |
|---|---|---|
| 批量跳过封存舰 | 原版 N1:368–378 明确跳过；W2:31–34 只按暂停字段是否相同过滤，没有 `mothballed` 条件 | **明确功能偏差**：Q/W 会修改状态不同的封存舰暂停标记。并不等于自动解封：`{ mothballed: false, ...member.logistics, suspendRepairs: ... }` 中已有的 `mothballed: true` 会保留 |
| 单舰封存防护 | 原版 N4:303–307、371–375 禁用；W1:118–120 只有全局 `repairLock`；W2:14–21 也不阻止封存舰；W6:22–24 与 W8:12 未向 UI 提供封存字段 | **明确功能／UI 偏差**：若权威状态存在封存舰，UI 无法正确表达该限制，命令也允许修改；不能以 W1:102“封存尚未接入”当成所有状态都不会封存的证明 |
| 日维修补给 | 原版 N1:195 → N9:207–219 包含合格成员基础维护 + 恢复；W1:177–179 明说不含维护，并读 `recoveryPerDay`；W7:16–17、W3:26–34 证实只投影额外恢复 | **明确统计／UI 偏差**：正常正维护费且正在恢复的舰存在时，Web 会少显示那部分基础维护。不是舍入问题；不能拿全舰 `maintenancePerDay` 直接加上，因为只应计入合格成员的维护份额 |
| 完成维修所需补给 | 原版 N1:194–214 有数值／“不适用”分支；W1:26、181–183 固定 `—`；W7:14–17 未投影该总量 | **明确未实现**：如实显示不可用优于编造，但不属于原版等价。截图的 49 也不能靠每日 4.4 反推得到 |
| 单舰操作说明 | 原版 N11:85–91 明确 CR、预计补给／天数、无需修理时说明；W1:97–98 只有动作、舰名及单舰范围 | **信息缺失**：当前文字没有明确告诉玩家暂停也阻断 CR 恢复，且缺成本／时长说明；不是只差翻译 |
| 全舰而非当前选择 | 原版 N1:368／376；Web W9:93–95 发 `fleetId` 并携带完整成员版本，W2:31 读取完整 roster；W1:208–210 没有维修目标筛选 | **该局部设计相符**：不能改成遍历可见卡片各发一个单舰命令；但仍须修正封存排除，才是相同目标范围 |
| 健康舰／零补给／重复 Q/W | 原版动作无损伤、补给检查，显式设置 true/false；W1:187–190、W2:23–37 也是显式策略、无货量条件、匹配项 no-op | **最终暂停字段的局部语义相符**，不代表原版运行或所有输入行为已验证；健康舰应保留策略变更能力 |
| 玩家舰队 vs 多舰队选择 | N1:84 固定玩家舰队；W1:169–174 允许选择舰队，W9:94–95 操作选定舰队 | **多人扩展边界**，不是原版现成 UI 行为。不要把所有可见／可控舰队一起暂停 |
| 权限、遭遇、跳跃、空列表与 pending 锁 | W1:146–163、W2:9–12 加了这些限制；原版已定位批量 handler 未见对应条件 | **Web 产品策略／待验证边界**：未追完原版所有外层可达性与模态锁，不能断言原版全局绝不限，也不能宣称这些新增限制源自原版 |
| 原子事务／上限 | W2:29–37 有 512 roster plan 预算；W11:12 的 256 个 expected 限制，加 W9:95 的 1 fleet + 全成员，使常规请求实际最多携带 255 成员；W10:176–199 覆盖两层预算 | **多人事务策略**，不是原版 Q/W 的舰船数量上限；本次不建议拆批以绕过原子性 |
| 快捷键与反馈 | W1:149–163 是 window keydown，过滤 repeat／组合键／编辑控件；原版 N1:97、99 走 shortcut，N13:246–255、466–497 经按钮输入／回调／flash；N1:353–361 刷新各行 | **未验证完全等价**：目前只确认 Q/W 动作方向和入口；不声称焦点、重绑、按钮声音、反馈时序或像素表现一致 |

### 6.1 现有测试不是原版行为背书

W10:25–29 的 fixture 明确令 `fleet-1` 为 `mothballed: true`。W10:59–71 的测试却要求每个成员都出现在 `changedMemberIds`，并修改每舰暂停标记。这不是“漏测了封存舰”，而是**把与原版相反的封存目标语义写成了期望**。

W10:77–81 验证的是已匹配策略不重复写；W10:84–104 验证版本冲突与完整期望集。这些 Web 事务性质即使通过，也不能推翻原版 N1:369、377 的 `continue`。本次未修改或运行该落库测试文件，不报告它的通过率。

## 7. 本次实际执行的验证

### 已执行（不写业务状态）

1. 查看上述用户截图。
2. 只读搜索／逐行阅读第 2 节相关源码；用本机 JDK 17 `javap` 读取第 4.2 节快捷键 JAR 信息，未解包写新文件。
3. 用 `node --input-type=module` 从 stdin 执行一次 Web **内存探针**，调用现有 provider／quote／recovery 函数，使用构造数据和模拟 `requireVersion`；未启服务、未开 SQLite、未创建测试脚本。结果：

| 探针 | 实际结果 |
|---|---|
| Q、W 各自作用于“非封存舰／标记相反的封存舰／标记已匹配的封存舰／健康舰” | 两个方向都返回 `active, mothballed, healthy` 为改动对象；封存舰 `mothballed: true` 被保留，但暂停字段仍被改；输入 world 未被直接修改 |
| 对封存舰直接调用单舰 provider | 同样允许规划暂停字段更新，没有原版 UI 的封存排除 |
| 合成有效统计：月维护 30，CR 恢复 0.1/日，部署补给 10，部署 CR 0.2，当前 CR 0.4，上限 0.7 | 未暂停 quote 为维护 1、恢复 5、总计 6；暂停为维护 1、恢复 0、总计 1 |
| 同一合成舰，舰体 0.5、维修率 0.1/日，推进 1 日且有补给 | 未暂停变为舰体 0.6、CR 0.5；暂停仍为舰体 0.5、CR 0.4 |
| 同一合成舰，起始无补给，推进 1 日 | 暂停与否 CR 均为约 0.35，舰体不修复 |

这组数字不是截图三艘舰的复算。对上述合成有效统计，按原版 N9:207–219 **静态推导**侧栏日维修值应为 6，而 Web 侧栏 W1:179 使用 5；没有执行原版 Java 方法来得到这个 6。探针也未验证权威提交、并发、网络重试或真实浏览器键盘事件。

### 未执行／未验证

- **真实原版运行验证：未验证。** 未在运行的游戏中按 Q/W、点击单舰按钮、切换封存、时间推进、检查存档或抓取原版前后画面。
- 未启动／测试 Web 浏览器页面，未做原版与 Web 像素、声音、提示浮层或响应时序对照。
- 未运行完整 Node 测试、构建、SQLite 集成或 Worker 回归；内存探针不是这些验证的替代。
- 未扩展到所有技能、舰船模块、战机成员、AI、mod hook、改键、战斗／跳跃外层可达性。

## 8. 后续实现前的最小验收矩阵（本次只列，不实施）

| 场景 | 需要观察／核验的预期 |
|---|---|
| 非封存舰混合暂停状态，至少一舰未选中／滚出视口 | Q 将全部非封存成员设 true；W 全设 false；选中与可见性不改变集合 |
| 舰体已满但 CR 低；另一舰舰体及 CR 均满 | 前者暂停 CR 恢复，后者仍能记录策略；不是只针对破损舰 |
| 封存舰分别带 true／false 暂停字段，与普通舰混合 | 两种批量动作都保留封存舰原暂停字段；单舰维修控件禁用；封存／解封另行处理 |
| 全部已暂停、全部已恢复、空舰队、仅封存舰 | 核对重复操作最终字段、按钮可达性与两行统计；Web 空列表锁是自身策略，不能当原版实测结论 |
| 零补给、少量不足一整步补给、正常补给 | 点击不预扣或补回资源；后续步骤按原版起始补给语义推进；暂停仍会维护、缺补给仍可掉 CR |
| CR 超过因 stats 变化后的上限 | 暂停不会阻止向当前上限下降 |
| 同时观察日维修、完成费用、全舰总补给消耗 | 三个口径分别核对；暂停后侧栏可为 0，但总补给消耗仍有维护等项；无恢复率时另核“不适用” |
| 单舰后再 Q/W；W 后再单舰暂停 | 单舰只改变该舰，批量仍按完整 roster 排除封存，而不是按刚选中的卡片 |
| 改键／编辑控件／弹窗／按键重复、遭遇与跳跃 | 需真正启动原版与 Web 验证，不能仅凭事件处理代码作全局保证 |

**交付判断：有清楚的原版来源，但当前不能标记“原版等价”。至少封存目标排除、封存单舰可用性、日维修统计口径和完成费用／提示信息仍有已定位差异；权限和事务限制则要独立标为 Web 扩展，不要混入原版结论。**

## 9. 主要审计输入指纹

下表是写文档时读取文件原始字节的 SHA-256，用于日后判断行号／源码是否已变更；不是整个安装包的真实性或等价性认证。

| 文件别名 | SHA-256 |
|---|---|
| N1 | `84B1A93F376539663705A72E0C6571EE0A64488708F765C699B61B97E0FB6BCD` |
| N4 | `02733AFB2762C55B0F963312875F43602F0E9902F48A98C1449091BDA5609D19` |
| N9 | `438B0B189421164687EF63E67F3FC7FA9A4669F757C3E63EDF278C0598F5A72F` |
| W1 | `417EC6A7A2EFFBFED475011A898FCA242A746DC840146702EDC2B0F96F0C9A9F` |
| W2 | `C360A44A880EE317BE112F6C20E54F5B4A0A1FAED80EDC5D531883315DEB3499` |
| W10 | `CF195150655E11A7F041118F7D21E21848E6FCB95918188150A90357013806F1` |

## 2026-09-20 修正实施门槛（编码前）

已重新查看上述用户原版舰队截图，并复核 N1:365–381、N9:207–219 与单舰禁用条件。此次仅修正已查实的行为：Q/W 跳过封存舰且保留其字段/版本；单舰封存维修控件禁用并由权威端拒绝；每日维修行使用正在恢复的非封存/非暂停成员的基础维护+额外恢复之和。不会把该值加进实际扣货而重复计费。完成维修总价/原版动态提示仍不冒充实现。

验证：混合/全封存/健康/重复QW、封存成员缺版本/并发变更、单舰拒绝、守恒和重放；纯报价边界与私有DTO/替换provider未提供字段时返回未知；浏览器检查封存按钮禁用及QW前后字段。此次不声称原版实机已测试。修改provider版本并拒绝旧锁，不静默迁移旧存档。
- 浏览器截图对照另发现已存在的按钮顺序偏差：用户截图从左至右为详情、凿沉、封存、维修扳手、改装；当前把后两者倒置。核对 N4:1452–1480 的 sprite 映射后，将维修恢复到第4位、改装第5位；不调整未知功能可用性。该证据来自已查看截图而非原版实机点击。

### 本次修正验收摘要

- 已落地上述封存排除、单舰封存拒绝、每日维修统计及按钮次序修正。原审计第6节中这几项为历史状态，完成总费用、提示与其它未实现部分仍有效。
- 浏览器三舰夹具：Q/W只改非封存两舰，封存舰版本始终0；货物/CR不变，侧栏2.7→0→2.7。新provider为0.7.0、规则集0.11.0；旧锁拒绝，不自动迁移。
- 最终campaign379通过/0失败/5可选跳过，新增排序原版专项另8/8；TypeScript、定向lint、独立campaign构建通过。未做原版实机Q/W；没有把Web回归或提取源码探针当成原版运行验证。
