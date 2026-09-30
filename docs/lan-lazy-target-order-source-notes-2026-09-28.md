# 火控候选惰性排序：实施前（2026-09-28）

## 来源与边界
本机原版0.98a-RC8，重新读取 decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:237–271（敌我/可见性/拦截/射界/指定目标优先），combat/systems/WeaponGroup.java:301–317（逐武器AI、shouldFire与发射）。反编译混淆符号仅核实流程，不复制异常反编译表达式。Web既有效用排序和统一预瞄后发射是扩展/现有差异，本轮不改变它们。无UI修改；原版实机未验证，不操作桌面。

## 候选
与已否决的AimQuery/相位/名单/系统统计缓存不同：保留每个候选的原始打分、预算查询、RNG以及所有实际挡线检查，只将完整排序改为线性选择首位。首位无阻挡则不排序其余项；首位受阻才排序，且不重复检查首位。数值非有限（threat允许+Infinity）、ID不是普通字符串数据属性、排序/字符串intrinsic被替换时保留原排序路径。冻结本次排名的ID后才能把排序延迟到安全回调之后，避免挡线回调改ID影响排序；不冻结实体状态/不缓存到下一次aim。有限数值保证比较器传递性；完全相等保持原输入顺序。只在至少8候选时尝试以摊薄检查成本。默认关闭VITE_AI_LAZY_TARGET_ORDER，未授权默认上线。

## 写集/验证
生产只改 src/engine/ai/AutofireController.ts；不修改host/接收/过载保护或模型频率。保存实施前精确字节、绝对路径及SHA，再冻结当前完整源图和当前public/game-assets。生产完成后一次typecheck、改动lint、既有176实体734挂点场景；真实before、candidate开启及candidate缺省三臂60步逐步完整权威+隐藏tracker/RNG比较，含技能、近距交火、排散和模块低血。补排名稳定性/NaN/Infinity/负零/ID回调/挡线后修改ID等定向合同，单独计数是否实际命中，不把计数当收益。

## 预登记性能裁决
正确性通过后唯一A0/B1/B2/A3独立隐藏Node，固定 C:/Program Files/nodejs/node.exe v24.13.0，2玩家+20AI，三舰循环web_zhuyuan/web_gloriana/web_sc2_hyperion，seed917，3200DP。此前五实验两边同开；150完整热身步+120计时完整fixedUpdate(1/60)。每对热段都至少省3%，冷段各不得慢超3%，init增量不得大于max(5ms,10%)，完整终态及输入SHA一致才保留。静态/正确性/数值/输入审核均为门槛；不重测择优、不降门槛。未过先核验所有candidate和before SHA，再归档精确回退本轮写集。通过也只保留默认关闭实验，浏览器功能验收另行，不能把离线时间说成联机延迟。
