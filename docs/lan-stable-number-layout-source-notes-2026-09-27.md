# 构造期数值槽稳定化候选预登记（2026-09-27）

## 来源与边界
原版0.98a-RC8 API：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java提供float getHitpoints/setHitpoints；WeaponAPI.java提供float冷却/蓄力接口。本轮保留Web原本JS Number双精度及最终每个字段的精确值，不把Java float当作降精度许可。无玩法或UI更改，无原版实机操作，界面等价不作为已验证结论。
现行构造函数给hullHp、武器可变小数计时/健康槽初始整数；随后小数伤害/射击会拓宽V8字段表示。唯一JIT诊断记录fixedUpdate同一hullHp点后段5次not a Smi，以及武器生命周期多处wrong map；不是证明所有map问题同源。属性组合函数warm无反复deopt，因此不恢复此前失败共享/编译方案。

## 实现
新VITE_SIM_STABLE_NUMBERS显式开关，默认关闭，仅在构造时分支，不在每帧加缓存/反射/查表。最终写集仅ShipWeaponControlSystem.ts；原两文件构想和before清单存predesign工件。编码前核实Ship.hullHp先声明为undefined（bundle为hullHp;），其Tagged字段不能靠稍后暂写小数收窄成Double；因此不实施无证据的hullHp提示，不改变构造期间原有可观察形态。
- WeaponMount仍用原字面量创建所有字段和原值；尚未push发布的私有对象，选定原本已有的小数可变数值字段先写0.5再写回刚读取的原值。无新增字段，无字段排序/descriptor改变，不碰spec，不改计数型ammo/barrel/RNG。特殊数NaN/Infinity/-0原样写回。
该技巧是V8布局提示，不是标准JS提供的强制存储保证；若引擎不采纳或总耗时没改善就撤回。

## 验证与唯一性能门槛
完整实现后集中typecheck、改动lint、相关真实场景合同。比较3臂构造后原始keys/descriptors/数值/完整authority与隐藏状态，特殊数helper和实际init/reinit构造路径；60完整步技能/靠近开火/排散/低血模块扰动逐步一致；默认关闭无临时数值写入。最终270步及20步hash必须与当前基底一致。
然后唯一无插桩独立进程A0/B1/B2/A3：真实2玩家+20AI、176实体734挂点、三舰循环、seed917、3200DP；四已有模拟实验双方同开，不混display-v2。每臂150热身+120完整fixedUpdate。两组热段分别至少省5%且两组冷段分别不慢于3%才保留；同时记录真实初始化耗时（不得明显退化超过每对较大者5ms或10%）。源图/资产/hash漂移立即失败。不能用trace计时或调用数冒充性能，不择优重跑。
通过才追加一次双客户端无头浏览器；失败则全部写集SHA预检/归档/恢复，保留其他WIP。不会默认启用、提交、发布、降低Hz/精度/实体数/画质或放宽权威/过载保护。
