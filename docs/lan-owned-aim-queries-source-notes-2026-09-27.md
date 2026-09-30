# 私有Worker单次aim查询准备：实施前（2026-09-27）

## 来源 → 行为约束
本机0.98a-RC8；重新读取combat/ai/private.java:237–265的阵营/资格、距离、弹速拦截、射界及指定目标优先；combat/systems/WeaponGroup.java:301–317逐武器advance/shouldFire/发射。Web既有先统一瞄准后按挂点顺序发射仍保留，不称与原版逐武器时序完全等价。无UI改变、没有新的桌面/原版实机验证。

热身后Node采样（完整270步状态与A0一致）中武器控制inclusive32.36%、aim14.38%、preAim10.61%；aim下prepareAimQuery重复系统弹速/射程合成有成本。不能把inclusive相加或从采样直接推出收益。

## 方案（不同于失败的全火控名单缓存）
现有aim对原生ship.hasNativeThreatPhaseHooks可惰性准备一次AimQuery，但自定义舰回退为逐有效目标准备。新增VITE_AI_OWNED_AIM_QUERIES默认关闭；不恢复FireControlQueryBatch的自定义舰目标/挡线缓存，不新建空间索引，不缓存isPhased或资格到下一步。
借用已通过的owned-interleaved写入认证和parent/sourceCarrier连通组，维护独立OwnedAimQueryPhase：开始时整个世界资格确认；每舰开始标记writer；每次组件推进结束后，只重新确认正在写的组，其它组由已完成writer的组审核保证没有出现新不纯读；ship.update结束再审核整组。资格丢失永久关闭本步scope，未知/重复writer、嵌套读事务、异常/finally关闭。沿用原系统事件在后续status dispatch的边界。
瞄准租约只注册在模块私有WeakMap，世界对象不能伪造布尔许可。WeaponControl在原aim try/finally边界打开/关闭，关闭早于requestWeaponFire；单个writer只能打开一次，不允许发射回调重新打开。每个aim仅查一次租约，第一次真正需要solve时仍按原顺序prepareAimQuery，后续候选借用同一对象，aim返回即结束；不跨挂点、preAim、当前舰更新或tick。角色/目标/排序/tie-break/随机/幅能/弹体校验不变。

## 动态数据与未知回退
完整私有数据命令域禁止导出可变Ship/原型、接收可执行对象；不是同realm插件沙箱。需要已有hasExactThreatPhaseHooks、原生系统统计/父链、不可变舰船metadata和原生盾心读者，且已取得独立writer资格。
RuntimeCombatModifiers非空不等于不纯：原生封舱写入的数值数据允许本次只读复用，但先逐描述符审核来源只含普通/null原型数值数据，拒绝getter/setter、函数、符号及超深对象，审核本身不调用accessor；不把旧hasNativePreAimRangeReads门槛放宽。来源仍可变，每次写组/瞄准入口重新审计，不新增永久纯度缓存。未知相位/伤害/系统/舰装/辅助链/状态回调仍拒绝。普通公开world没有私有注册，不读取新world属性或接受caller布尔。

## 固定验收与裁决
写集七生产文件（一个新模块），前置备份冻结，保留全部其它工作。一次集中typecheck、改动lint、真实176实体734挂点合同：初始化/重建/default；writer/组/租约/重入/发射前关闭；数值runtime与未知accessor；aim参数逐挂点、命中选择和隐藏tracker/RNG；未知回调顺序/异常；60完整fixedUpdate技能/近距/排散/封舱逐步权威+隐藏状态一致。诊断只计prepareAimQuery次数与租约，不能据此宣称加速。
行为全通过后只一次A0/B1/B2/A3独立隐藏Node，每臂150热身+120完整计时步，两边四既有实验全开，三舰2玩家+20AI/seed917/3200DP。两组分别省至少3%、四完整终态相同才保留。不重跑择优、不调门槛；失败精确恢复七文件（核对所有SHA、删除仅本轮新文件），不跑浏览器。离线过门槛才一次既有双无头浏览器实际176实体功能验收；仍过载或无稳态Hz/P95就不宣称联机改善，默认不启用。不改频率、精度、实体/画质/过载保护，不提交/推送/打包/发布。

## 最终状态
已完成正确性验收及唯一ABBA，第一组2.9736%未达到事前3%门槛，候选撤回；不运行浏览器。见同日result文档。回退保留10个写集外并发改动，后续不得把旧冻结726模块当作当前完整基底。
