# 原版货物吊舱机制：有边界审计（2026-09-20）

## 范围与证据等级

- 遵守根目录 `C:/Program Files (x86)/Starsector/starsector-web/AGENTS.md`：本轮**只审计，不补功能、不暂存、不提交**。仅写本文。
- 本机基线：**0.98a-RC8，中文汉化包 2026.09.04**，见 `C:/Program Files (x86)/Starsector/starsector-core/localization_version.json:2–7`；启动器记录见同目录 `starsector.log:1`。这是本机安装基线，不代表已验证未汉化发行版。
- **已做：源码/反编译交叉检查、规则与界面调用检查、静态资源查看。未做：原版实机操作/截图、Web 操作/测试。** 下文“证实”均指静态证据，不能作为实机验收。
- 原版一般货舱表单、排序、布局由主代理负责，见 `C:/Program Files (x86)/Starsector/starsector-web/docs/campaign-cargo-ui-native-audit-2026-09-20.md`；本文不重复，只记影响吊舱机制的入口和交互语义。

## 证据索引

以下编号固定指向绝对路径；正文的 `编号:行号` 均为本次读取文件的 **1-based 物理行号**（CSV 含多行字段）。

| 编号 | 文件 |
| --- | --- |
| N1 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/CargoPodsEntityPlugin.java` |
| N2 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/util/Misc.java` |
| N3 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/rulecmd/salvage/CargoPods.java` |
| N4 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/GenericFieldItemManager.java` |
| N5 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/GenericFieldItemSprite.java` |
| N6 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/CoreScript.java` |
| N7 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/CargoPodsResponse.java` |
| R1 | `C:/Program Files (x86)/Starsector/starsector-core/data/campaign/rules.csv` |
| R2 | `C:/Program Files (x86)/Starsector/starsector-core/data/config/custom_entities.json` |
| R3 | `C:/Program Files (x86)/Starsector/starsector-core/data/config/settings.json` |
| B1 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/class.java` |
| B2 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignEngine.java` |
| B3 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/coreui/q.java` |
| A1 | `C:/Program Files (x86)/Starsector/decompiled/starfarer_api_source/com/fs/starfarer/api/campaign/VisualPanelAPI.java` |
| D1 | `C:/Program Files (x86)/Starsector/decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/CargoPodsEntityPlugin.java` |
| D2 | `C:/Program Files (x86)/Starsector/decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/rulecmd/salvage/CargoPods.java` |
| W1 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/CooperativeCargo.mjs` |
| W2 | `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/client/CargoPodPanel.tsx` |

用户简称的 `client/CargoPodPanel.tsx` 实际位于上表 W2。N1 与 D1:49–100 对过期/几何一致；N3 与 D2:179–221、260–282 对失稳/破锁/拾取回调一致。源码英文文案不直接等于本机汉化文案；例如 D1:92 为“冷冻舱”，W1:43 为“冷冻吊舱”。

## 最小对照：原版证据 → 行为 → 当前差异

### 1. 生成与几何：已实现一部分，不是完整生命周期

- **入口已闭合**：B1:700–704 → B2:2158–2161 广播 `reportPlayerDumpedCargo` → N6:812–823 的 `CoreScript` 监听器 → N2:3245–3258 `Misc.addCargoPods`。在玩家位置创建中立吊舱，`addAll(cargo)`，挂 `CargoPodsResponse`，再通知 `reportPlayerLeftCargoPods`。N6:832–840 的“未拿走战利品”也创建吊舱，但该方法**没有**挂同一回收响应脚本，不能把所有来源视作完全一样。
- N1:88–115：`M = spaceUsed + fuel + totalPersonnel`；`P = clamp(floor(sqrt(M)), 5, 40)`；实体半径 `10 + 10*sqrt(P-4)`；人员严格大于其余两项之和才用冷冻舱名称/描述。W1:33–43 在其 commodity 范围内采用相同公式；不据此声称 float32 等价。
- W1:12–29、120–137 只支持已知非 meta、非 credits 商品，且每次抛弃创建一个对象；原版入口使用一般 `CargoAPI.addAll`。武器/特殊物品的完整支持不在本轮修正范围。

### 2. 漂移与过期：永久、定点保存是明确差异

- N2:3250–3256：随机方向、速度模 `5 + 10*random`（[5,15)），`discoverable=null`、`discoveryXP=null`、sensor profile=1。**不是原地不动**，也不是绕舰队公转。实体位移积分可见 `C:/Program Files (x86)/Starsector/decompiled/starfarer_obf/com/fs/starfarer/campaign/BaseLocation.java:620–627`；该段为混淆反编译，时间单位/暂停/离区推进仍须实机核实，不能直接把速度写成“每天 5–15”。
- N1:53–85、114、125–151：基础寿命 `5 + P - 5 = P`，通常 **5–40 游戏日**，剩余量为 `maxDays + extraDays - elapsed`；深渊深度 ≥1 时 elapsed 按五倍日数累积。`neverExpire` 可例外跳过过期。
- **到期不等于立即消失**：只有不满足“当前空间且对玩家可见级别为 COMPOSITION_DETAILS 或 COMPOSITION_AND_FACTION_DETAILS”才开始淡出。低级接触信号不等于这项保护；保持详细可见也没有重置 elapsed。N2:3133–3160 的淡出先标记不可点击，再经默认 1 秒淡出过期，不是直接删对象。
- N1:14–17、31、77–82 的探测规则与实体半径不同：探测计算用 `10 + 10*sqrt(P)`，再 `min(500 + 20*r, 2000)`，details override multiplier=0.5。不要误把碰撞半径公式复用为探测公式。
- **差异**：W1:8、45–60、132–134、157–164 只有创建 tick、位置等信息，无漂移/寿命/稳定/传感状态；W2:13 明示永久保留的临时开发规则。这是诚实标注的 WEB 策略，不是原版等价。多人“对谁可见才保护过期”在原版单玩家逻辑中没有答案，必须另行确认，不能自行选“任一玩家/创建者”。

### 3. 部分拾取与稳定：保留原对象，且失稳有前置条件

- N3:317–342 + A1:41–42：原版打开 `showLoot(..., canLeavePersonnel=true, revealMode=false, generatePods=false, ...)`，不是立即全收。关闭后更新几何/基础寿命；空了才淡出并关闭对话，非空保留原吊舱；比较前后货物不同才调用 `destabilize()`。比较依据见 N2:3773–3799。
- **关键限定**：N3:218–238 在 `$stabilized` 为 false 时直接返回。因此未稳定吊舱部分取货后**不重置 elapsed、不重掷速度**；只按剩余货物更新基础寿命。已稳定吊舱内容发生变化，才清轨道、重设随机漂移/profile、elapsed=0、extraDays=0、取消稳定标记。只查看不改变货物不会失稳；规则也明确“添加或移除”都会破坏稳定（R1:3884–3886）。
- N3:118–125、155–184：稳定成本 `max(floor(M/200), 2)` 补给，extraDays=400、elapsed=0，设置圆轨道（无焦点则速度归零）。R1:3862–3870 禁超空间/临时空间，已稳定且 daysLeft>300 时禁再稳定；R1:3890 甚至在“所需补给 **等于** 持有补给”时禁继续，这是本机规则的实值，不擅自修正为 `>`。
- **差异**：W1:139–155 的命令只有 fleetId/podId，整舱转移后删除；W2:12 只有“回收全部货物”。缺少部分取/放与剩余对象处理。B3:180–203 还证明原版 TakeAll 第一次只取 `min(freeFuelSpace, stackSize)` 的燃料（无正余量则跳过），`tookAll=true` 后再次点击将该上限放宽为 `1e9`；非燃料直接拿全部。故 W1 无条件全舱超载收取不等于原版**首次 TakeAll**，“允许超载”也不等于“一次无条件全收”。B3:130–140 的普通/loot 模式 Esc 取消与确认差异由主代理 UI 审计记录，本文不重复。

### 4. “危险品”：勿混淆货物类别、吊舱陷阱与行动锁

- **证实的危险机制是锁/自毁陷阱**：N3:40–69 + R1:3871–3883 区分 `$locked`、`$canUnlock`、`$trapped`。有代码时可打开并清锁/陷阱；无代码强开非陷阱舱走 `pruneCargo(0.5)`，对每个 stack 的整数个数逐个掷骰，**并非保证精确留一半**（N3:242–267）。强开 trapped 舱则清空货物并淡出（N3:270–272）。
- 本轮指定生成/过期/开舱路径中，**未见按 fuel、volatiles、毒品等商品类别自动爆炸、伤害舰队或拒收的判断**；这只是有边界的负面检索结果，不证明全游戏没有危险物品特殊脚本。燃料“全部拿取”限制是容量语义，不是危险品爆炸规则。不可凭名称新增爆炸概率。
- N6:824–826 的默认上锁/陷阱设置是注释，普通玩家抛弃入口未启用。W1:45–60 的 schema 不含锁/陷阱，属于尚不支持特殊吊舱；W2 的 `locked` 也不是 `$locked`，其来源是 `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/client/CampaignApp.tsx:73` 的忙碌/待回执/遭遇/跳跃状态。不要用“舰队行动已锁定”冒充原版货舱锁。

### 5. 他人回收：海盗条件响应 ≠ 任意 NPC 自动拿走 ≠ 联机所有权

- N7:27–75：响应脚本按 0.05–0.15 游戏日间隔扫描，3 日后/舱失效/不可点击即结束；挑最近合格舰队，距离须 <500。N7:150–184 要求非玩家、有 AI、海盗 memory 标记、非战斗/忙碌，另排除冻结分配、逃跑、保持接触、拦截、离区销毁任务，以及完全不可见或 `M/maxCapacity <0.05` 的对象。
- N7:78–108：调查 HOLD 时长 `min(5*M/maxCapacity, 1)` 日，完成回调把吊舱全部货物加给舰队、清空舱并淡出。此链没有按抛弃者所有权拒收的检查；但不能推成所有 NPC 对所有来源吊舱都会回收。
- W1:57–58、89–95、139–155：`createdBy/sourceFleetId` 只是来源，命令检查的是执行者对**拾取舰队**的控制权，没有对原抛弃者的专属回收限制；这两个目标文件没有上述海盗响应。可联机跨玩家回收是 WEB 扩展，不是单机源码能验证的多人语义。现有版本/幂等/权限保护应保留，不因原版没有联机就删掉。

### 6. GenericFieldItemManager：视觉小舱不是货物实体

- N1:40–48 + N4:32–54、57–92：仅当前空间创建/推进小舱精灵，离区丢弃 transient 列表；以实体位置为渲染原点，传感淡入亮度参与绘制，数量不足再补到 numPieces。N5:93–117、174–192：随机自转、局部运动、1–2 日可视寿命和淡入淡出，**不会逐个扣库存或令母吊舱过期**。numPieces 下降时也不是立即截短列表，旧精灵随自身寿命移除。
- R3:1238 指向 `C:/Program Files (x86)/Starsector/starsector-core/graphics/debris/cargo_pod_sheet1.png`；32px cell、显示尺寸10、生成范围实体半径×0.75 来自 N1:44–47 / N4:77–79。已静态查看该图集及 R2:1274 对应的 `C:/Program Files (x86)/Starsector/starsector-core/graphics/illustrations/cargo_pod_drift.jpg`。
- W2:11 使用同路径插图只证明素材选择；R1:3856–3862 原版先描述/检查内容物/稳定/离开，再进入 loot 界面。**看过插图和界面构建代码不等于看过原版实际界面**。不在本文重复整体布局审计，也不据 W2 推断星图渲染是否已还原。

## 仅三项后续修正建议（本轮均不实施）

1. **优先保留部分转移与剩余吊舱**：待原版界面实测后，与主代理共用货物转移交互，服务端支持选定数量取/放、保留非空原对象、仅空舱移除；区分未稳定/已稳定的寿命回调。验收至少覆盖不改货物、部分取、放回、全空，以及燃料第一次/第二次全部拿取；保留并发版本校验。
2. **生命周期单独做最小闭环**：持久化漂移/elapsed/extraDays/稳定/淡出状态，先验证常规空间的移动、5–40 日阈值和可见保护；传感/多人可见策略未确认前保留“不完整”标注，不抢先接一个纯 TTL 删除器。GenericFieldItem 的视觉运动不得代替实体运动。
3. **特殊舱与他人回收暂列后续门槛**：先保持普通抛弃舱未上锁，不造危险品爆炸规则、不造创建者独占权。未来接任务舱/AI 时，仅按本机锁/陷阱分支及 CargoPodsResponse 条件补；不本轮扩展整套 AI、物品系统或多人政策。

## 原版实际界面/操作待验证（未执行）

| 最小场景 | 需记录的原版证据 |
| --- | --- |
| 普通抛弃 → 接近/远离/离区；临近及越过寿命阈值 | 同分辨率的近/远/可见级别、漂移、暂停与离区恢复、到期仍详细可见及离开后的淡出；深渊倍率另测，不拿源码当目测。 |
| 未稳定/已稳定舱：仅查看、部分取/放、取空；油舱接近满载 | 各步骤前后剩余货物/名称/寿命提示、返回/关闭状态；第一次与连续第二次“全部拿取”的燃料行为。稳定成本相等、超空间禁用提示也需记录。 |
| 普通燃料/挥发物混合舱；另备无代码锁舱、陷阱舱 | 检查/强开/自毁文案与结果，勿把 trapped 舱损失归因于货物种类；如无合法测试入口就标未测，不改存档伪造已验证。 |
| 玩家抛弃后有符合/不符合条件的附近海盗 | 是否在响应窗口内调查、货物归属与舱消失；无人响应不直接证明代码无效。联机另一玩家回收不属于原版实机验证。 |

**停止边界**：入口、五个重点机制及精灵管理已形成可执行对照；未继续追查全引擎传感、所有任务吊舱生产者或完整货舱 UI。本轮无功能代码、存档、配置、资源修改，无测试运行、暂存或提交；唯一新增文件为本文。
