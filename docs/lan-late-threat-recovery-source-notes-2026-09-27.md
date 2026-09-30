# 武器威胁先做距离上界：实施前（2026-09-27）

## 当前证据与原版来源
本轮重新冻结当前735个非campaign源码/JSON模块；旧726模块不再当作当前基底。两份同源270完整步（原样、源码内计数）初始176实体734挂点，20/270步完整authority+隐藏tracker/RNG相同，冻结期间无漂移。
热身后120步，owned-interleaved模块AI中572104次恢复读取有566241次随后被既有距离包络拒绝（98.98%）。前20步96800次全部被距离包络拒绝。计数不是性能结论，但支持先廉价拒绝再查询恢复状态。
本机0.98a-RC8：decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/D.java:316 getTimeToVent，排散速率/剩余时间；combat/ai/private.java:237–265先空间候选再阵营/可见性、范围、拦截与射界。这里只核实相关来源，不把Web多秒武器威胁预测称作原版原样实现。无UI改变、无原版实机验证。

## 实施方案与不同点
默认关闭开关VITE_AI_LATE_THREAT_RECOVERY。只在现有闭合Worker owned-interleaved WeaponThreatEnvelope内，把**既有、相同公式/余量的距离上界**移到recovery读取之前；只对上界接受者计算原Math.max过载/排散/相位/封锁恢复值。没有新索引、相位缓存、恢复值缓存或aim查询复用；不重启上轮被否决候选。既有包络的族组失效、作用域关闭和未知writer关闭不变。

额外门槛：phase建立时一次检查恢复读者原型身份、所有实体相关组件实例原型及覆盖读者；不调用未知getter来认证。仅检查原生读面，不改任何方法。整个phase只有已审计的原生writer执行，不允许任意same-realm代码替换方法。每敌舰只做当前舰/父链的runtime为空和外部phase效果为空检查；非空/未知走旧顺序。forExactPhase单独使用、公开world或closed scope不能获准重排。现有get仍逐次校验exact资格，不复活资格命中复用。

失败/无穷/NaN/无包络仍走旧计算；若上界拒绝，原代码在恢复检查之后也必然拒绝，不影响武器候选顺序、伤害/方向/ETA、forecast cadence或RNG。远距回调少调用只允许已知纯读；未知读者必须保留原序/异常。

## 事前验收
写集计划Ship.ts、WeaponThreatEnvelope.ts、ThreatAssessment.ts三文件。完整实现后一次typecheck、改动lint、定向合同：真实init/reinit/default生效；原生/未知恢复读者及runtime/父链/覆盖方法回退；close/exact-only；多舰种/距离/技能/排散/过载/NaN/Infinity/重入异常；60完整步覆盖既有技能、开火、排散、封舱逐步全状态相同。计数需证实减少，不当收益。
正确性通过后一次A0/B1/B2/A3独立隐藏Node，每臂150热身+120完整fixedUpdate，原三舰2玩家+20AI/seed917/3200DP、四既有实验两边全开、只切新候选。两组各至少省3%、完整终态相同才保留。失败按SHA撤回三文件，不重测择优、不调门槛、不跑浏览器；通过才一次既有完整双无头浏览器功能验收。默认仍关闭，不降低Hz、精度、实体/画质或放宽保护，不提交/推送/发布。冻结文件之外的并发改动单独记录并保留。

补充：原版D.getTimeToVent还包含最小排散幅能/最小速率项，当前Web已有简化公式，本候选不更改或冒充补齐。实施后静态复核在首次验证前补入getMotionStats、系统modifiers/运动合并/射程方法身份及Vector2.set门槛，冻结candidate-v2；v1未测量。

## 最终裁决
六合同/typecheck/lint通过，唯一ABBA节省1.3061%/4.0018%，第一组未达3%，三文件已撤回；735模块全部匹配基底。没有浏览器新结果。详见同日result。
