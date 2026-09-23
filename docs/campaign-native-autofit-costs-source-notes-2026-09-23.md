# 原版 OP/改装属性服务对照（2026-09-23）

## 原版证据 → 行为
- 0.98a-RC8：HullVariantSpec.java:789–853，武器按实际 Java HashMap 次序、机翼按下标累计 OP，跳过内建装备；插件跳过内建与永久化项，通量各一 OP。每步保留 Java float/int 舍入。
- BaseWeaponSpec.java:460–518：角色尺寸加成 → weaponOPCostMult → round → 舰船类型/beam/PD动态加成 → listener 快照 → round、下限0。FighterWingSpec.java:73–91：all_fighter_cost_mod 的调用结果未赋值，按角色加成后监听器/round/下限0；异常反编译点需用安装 jar 字节码复核。
- HullVariantSpec.java:115–116,826–839：OP缓存是 transient，首次或插件失效时创建无实体、无FleetMember的 MutableShipStats，仅调用 affectsOPCosts 的 beforeCreation；若无此类插件则缓存 null。原版 clone 为浅拷贝缓存，插件修改只清 nullable 标志，不立即清旧缓存。
- g_0.java:453–458、CoreAutofitPlugin.java:989–1017、O00O.java:210–225、Misc.java:5580–5591：OP上限/通量上限使用实际角色 StatBonus；普通 hullmod 在非四种舰型默认2，而 S-mod排序成本默认护卫舰，不能混用。
- Utils.java:905–918：computeNumFighterBays 新建临时属性，依序运行全部 active hullmod beforeCreation，再截断并下限0；不能直接返回 hull.fighterBays。
- 已有 OriginalMemberEffects 的 HBI/VastHangar/RuggedConstruction 与原版匹配，可共享执行；Automated 的无成员分支须保留真实 null 上下文。ConvertedHangar.java:53–145 需要补全 beforeCreation（额外机库、战机OP引发DP/补给、船员、整备/S-mod加成），不移植 UI 或 afterCreation。

## 本块范围与差异
- 接真实 OP 预算/插件效果及缓存到默认自动配装，并统一已有舰队强度OP计算，避免两套公式漂移。
- 原版规格已接入；本块不造蓝图历史、物品世界管理器、开局或生产空舰队工厂。自定义未移植插件和监听器须有实际服务，否则明确拒绝。
- 不修改 UI；用户原版截图布局不变，不启动游戏或操作桌面。来源仅公开资源、反编译与安装 jar。

## 验证
- 集中类型/lint与一个既有短月结场景：真实成本、角色修正、OP插件缓存/失效/克隆、监听器次序、改装机库、默认 doFit。
- readyForAuthority=false / simulation.status=unavailable，生涯内容不暂存、提交、推送、打包或发布。

## 本块验收结果
- 原版 FighterWingSpec 安装 jar 字节码已确认 all_fighter_cost_mod 返回值被 POP，保留该行为。
- 默认服务已接装备成本、角色加成、OP 插件缓存、variant-only beforeCreation 和实际机库数量；舰队强度复用同一预算，保留可替换适配器。
- 验收发现并修复类型交叉重载、两项重复插件声明与未用导入；Hermes 原测试忽略了原版 spare-OP 换装阶段：真实结果为两把 lightmg + vents10/caps7 + fluxdistributor，恰好27/27 OP，而非26/27。已对照 CoreAutofitPlugin.java:582–631,655–673 修正断言，未为测试更改算法。
- 最终类型/改动 lint 均退出0；只复查同一个既有短月结场景，1通过0失败，场景513.9634ms/总1022.1376ms。日志：artifacts/campaign-native-autofit-costs-{types-final,lint-final,scenario-final}.log。未跑大型人员、全套或UI测试。
- 未移植 active hullmod/非null监听器仍要求真实服务。尚缺势力装备知识及蓝图历史、世界物品经理、模块/变体/DModManager与生产工厂等，不能据此声明完整制造或生涯已完成。
