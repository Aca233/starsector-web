# 技能修饰合成：空字段枚举消除（2026-09-28）

本机原版0.98a-RC8 API证据：decompiled/starfarer.api/com/fs/starfarer/api/combat/MutableStat.java:230–248分别累计flat/percent/mult，:286–290返回原计算值；MutableShipStatsAPI.java:129–133分开三种武器射程stat。沿用本轮已读WeaponGroup.java:301–317的真实发射顺序，不改变属性数值/组合或AI算法；UI和原版实机无改动、未验证。

Web基准为当前Modifiers.combineSystemModifiers。它保留a的属性/符号、按Object.keys(b)的原顺序计算，再总是创建新的weapons及BALLISTIC/ENERGY/MISSILE对象；b缺少某类时，原算法执行Object.keys({})，产生无意义临时空对象/数组。候选只把首次b.weapons?.[type]读入局部，当其nullish时不执行空对象枚举；有值时仍用Object.keys，值仍通过原b.weapons[type][key]逐次读取。保留异常/访问器/Proxy的可观察读序、原浮点及undefined传播，不缓存任何结果、不加资格检查、不删除结果空字段、不复用返回对象。

写集只有src/engine/extensions/ship-systems/Modifiers.ts；VITE_AI_SKIP_EMPTY_MODIFIER_KEYS默认关闭。compile时消去开关，不增加热路径身份检查。和已失败的getter/span/资格缓存不同。源码/资产先冻结，真实before由此次备份替换形成。

集中一次typecheck、单文件lint、通用组合随机/特殊数值/访问器/Proxy/异常/对象身份合同、真实host init/reinit/default、60完整步技能/交火/排散/模块战损逐步authority+隐藏RNG/autofire对照。完成后唯一ABBA：同Node24.13.0、同默认五实验全关；A0/B1/B2/A3独立进程，各150热身+120完整fixedUpdate计时，2玩家20AI原三舰/seed917/3200DP/初始176实体734挂点；两组各省至少3%，冷段不恶化>3%，初始化增加不得超过max(10ms,10%)，状态与全部输入一致。不重测择优或降低门槛；失败精确撤回，通过仅保留默认关闭，另做生产式浏览器验证。调用减少不代替整体净收益，不降Hz/精度/数量或放松保护，不提交/发布。
