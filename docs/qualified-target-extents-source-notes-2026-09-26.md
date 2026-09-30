# 已审计目标外延：来源与失效域（2026-09-26）

上一轮Object行补丁已保留。本轮检查OwnedFireControlReadGuard：仍需在每舰运动/维修后实时检查全部成员，不删O(N²)的动态资格校验。选择优化的是只读瞄准阶段中的重复几何读取。旧315模块CPU采样outsideAcquisition自用91.451ms/60tick，仅用于定位，不代表最新版本可预期收益。

原版0.98a API证据：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:30 getCollisionRadius，ShipAPI.java:589–590 getShieldCenterEvenIfNoShield/getShieldRadiusEvenIfNoShield。几何值是实时接口，不授权跨阶段或跨舰更新缓存。本轮不改几何公式、角度/拦截/发射行为，无新增原版画面/实机结论。

当前Web targetRadius对SHIP取max(碰撞半径, active非NONE/PHASE护盾半径+精确世界坐标中心偏移)；solveWeaponAim在保守获取、射程、半角检查中反复读取，且多个挂点再次重复。shieldCenterOffset每次仍查WeakMap及5个源标量，必须保留世界坐标舍入（不可替换为静态局部偏移长度）。

候选限定已有FireTargetQualification：仅封闭Worker、完整实时guard通过后生成的目标名单；每个单舰FireControlQueryBatch拥有独立懒建Map，按Ship身份保存精确原公式结果。Autofire的已审计名单迭代才传递证明。每次solve取一次，之后同解算复用；显式currentTarget、tracker目标、MISSILE、generic/复制/外来名单均不缓存且保持原读取顺序。close清空Map并释放引用；名单长度变化撤销active，下一阶段重新读取。

ShipWeaponControlSystem.ts在完整运动/系统/维修后创建batch；瞄准期间只写挂点/跟踪器/请求集合，finally.close后才执行发射。守卫、首轮每个目标的资格读取、精确碰撞、候选顺序、排序/RNG及decide权限不变。新缓存不进入DTO或快照，不跨tick，也不是命中结果缓存。

先完成两生产模块及既有combat-ai中定向合同，一次typecheck/lint/combat-ai。使用同realm冻结旧Autofire比较，覆盖护盾类型/active半径、偏置与极端坐标、零/NaN/Infinity、关闭/长度变化/新阶段、复制名单与通用getter顺序。之后只做一轮真实Host200舰150预热180tick无插桩固定串行对照，完整包/显示图/权威审计不减；无可靠净收益就撤回，不重复挑结果。不操作桌面/子代理、不提交发布，不覆盖并发改动。

本轮冻结317模块，起点比上一接受显示补丁源图多了并发舰装工作：Ship构造使用refit.voidShield、HullMods新增GlorianaHullMods、GlorianaEdict增加装填器倍率。已检查其差异，不改动/回退，且两臂包含相同版本；本候选只差AutofireController与QualifiedFireTargets。
