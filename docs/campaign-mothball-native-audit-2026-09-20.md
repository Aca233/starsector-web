# 单舰封存／启封：原版对照与整链接入（2026-09-20）

原版0.98a-RC8。本轮先读源码及用户已有Fleet截图，不启动游戏/浏览器，不截图或操作桌面。截图为C:/Users/Aca/AppData/Local/Temp/codex-clipboard-a6f03cc9-d29c-4dff-892b-1d4ac1653e5b.png：每舰操作顺序为详情、凿沉、封存、维修、改装；保留已有位置与原版mothball图标，不加新面板或确认弹窗。截图不证明点击结果；本轮视觉/实机验收仍待许可。

## 原版证据 → 行为

- decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/RepairTracker.java:447-460：状态真正改变时，封存记住crPriorToMothballing并清零CR；启封取回暂存CR；重算舰船stats、标记舰队同步。同值调用不覆盖暂存CR。
- 同文件:124-135：advanceCRAndRepairs在正时间推进时清零crPriorToMothballing（及临时crash标记）。不能永久保存CR，不能启封就自动满战备；0时长查看不清除暂存。
- coreui/*_cfr_32.java（FleetMemberRow）:624-638：封存按钮直接setMothballed取反，再setSuspendRepairs(false)。没有确认对话框；舰体/装甲/货物/配装不直接改变。
- 同文件:315-324：mothballed时按钮高亮；封存没有最后一艘船禁用条件（那是出售/仓储/凿沉）。不能误套邻近switch分支。维修按钮在封存时禁用。
- starsector-core/data/strings/tooltips.json:73-80：封存不提供货舱、燃料舱和载员空间，不可修理/出战；正常启封后以现有后勤消耗补给恢复。现有FleetStats已处理容量和维护效果，应复用而非另造计算。

## 当前差异 → 本轮修改

已有状态mothballed、后勤和私人投影，但按钮是禁用占位，缺权威命令与封存前CR字段。本轮贯通原按钮→客户端期待版本→HTTP白名单→规则命令→SQLite原子回执→私人投影/后勤刷新，并让正时间推进清除暂存CR。新字段可选，旧状态缺失按原版字段默认0；不修改原版存档文件。保留当前联机时间策略：菜单不自动暂停整个共享世界，因此跨模拟tick后启封CR为0；不暗改成单人全局暂停。

只允许有指挥权的玩家操作，遭遇和跳跃中拒绝；入参显式布尔、同一请求重试不重复切换、不转移船/货物，不产生费用或资源。其它成员状态、外部字段和无关工程改动保留。规则版本应更新而不静默接受旧锁；不自动覆写现有用户世界。

## 验收

复用现有舰队/后勤/网关测试支架，只增加关键链路：封存→立即启封、封存→正时间推进→启封→恢复；回执幂等/越权/旧版本及磁盘保存。TS与定向lint验证UI连线，不将此称为视觉等价完成。

## 本轮落地与验收结果

已接通现有Fleet单舰封存位置，不改变五图标顺序：CampaignApp→CampaignHud→FleetPanel→HTTP白名单→Worker/Repository→logistics.set-mothballed→成员版本/私人投影。封存时CR清零、取消暂停维修并立即影响已有后勤容量；启封按暂存CR恢复，同值请求不重新清零/覆盖暂存，正时间推进清除CR撤销值。船体/装甲/货物未直接修改。

规则锁为reference.cooperative 0.16.0，logistics provider 0.8.0；旧规则锁不会被静默接受，现有开发数据库未升级/覆盖。启动使用旧锁的世界仍须显式迁移或另建开发世界，不能以重建覆盖用户存档。本轮没有启动开发服务或用户世界。

仅在已有套件新增两条整链案例：SQLite保存/重开/重试、正时间恢复以及HTTP认证/权限/回执/容量与CR投影；复用舰队、后勤、网关相关回归均通过。修正新增测试的Windows数据库关闭先后顺序后重跑通过。原生SQLite仍有ExperimentalWarning。

前后端TS类型检查与定向单线程lint通过；实际FleetPanel以React SSR在内存渲染，核实封存图标仍位于维修前、封存高亮、操作锁禁用、封存期间维修禁用。SSR仅用模拟目录URL且不请求资源，不证明实际图片显示、悬停样式、浏览器点击或视觉等价；这些仍待用户允许前台核验。完整战斗部署桥接尚未完成，本轮未宣称已经验收封存舰在真实战斗选择界面不可部署。

验证日志在Git忽略的artifacts/campaign-mothball-{regression,lint,campaign-types,app-types,ui-structure}.log。没有子代理、桌面操作、截图、提交、打包或发布。
