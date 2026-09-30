# 发射前单舰武器属性共享：实施前（2026-09-27）

## 证据与来源
前一轮唯一非计时诊断已对照真实自然270步和60步技能/靠近开火/排散/模块低HP，完全状态相同。warm120两getter合计1258370次、20808个单舰瞄准段；每段内三武器类型×射程/弹速六个最终数值均未变化。90.86%读取来自三类自定义根系统。它不是速度收益或任意读者纯度证明。
已核实本机0.98a-RC8 combat/ai/private.java:249–265，api/combat/MutableShipStatsAPI.java:196–198、MutableStat.java:345；原版独立stat读取只作为接口来源，Web当前完整组合函数才是数值基准。无UI修改、无原版实机验证。

## 新方案（不原样恢复已否决方案）
默认关闭VITE_LAN_WEAPON_STAT_SPAN。不重做每getter标量公式，不恢复单次aim prepare复用，不缓存目标/相位/空间候选；AutofireController及所有拦截/射程数值算法不修改。新增短生命周期读span，只在同一ship的整段pre-emission瞄准循环内，首次需要range/speed时执行原ShipSystem.modifiers，随后这两个getter复用同一完整结果，涵盖多个挂点、aim及preAim。其它getter尤其发射成本/弹药/伤害仍走原路径。
模块私有单活动读指针使热getter仅做身份比较，不做Map/反射/定义审核。undefined武器类型仍无读取。任何外部API不会收到可变缓存对象；不新增可序列化权威数据。close在requestWeaponFire之前，异常finally关闭。重入/重复open关闭原span且不重开；首读发生异常则失效，不留下半成品。
复用已保留owned-interleaved的writer认证与parent/sourceCarrier依赖图，不复制第二份世界图。阶段入口整体读域审核；每writer组件更新后的open与finish仅复核该family；未知writer由既有门槛关闭整个阶段。只有真实私有Worker的该阶段能够注册world，不信任caller属性许可。exact-only/default/public world无权。

## 读写域证明
ShipWeaponControlSystem组件修复/故障结算、手动交替组维护在open前。循环仅写triggerHeld、currentAngleRad、aimIdleSeconds、tracker/fireControl和故障挂点burst/firing状态，不扣弹药/幅能，不推进系统生命周期。
专门许可当前六份注册身份定义：NONE、Eclipse、GlorianaEdict、HyperionYamato/Jump、AdunSolarForge，不从未来宽泛hasNativeStats集合隐式继承。逐源审核其modifiers/passiveModifiers/isExecuting/moduleModifiers不读上述瞄准写集：Eclipse读flux；Edict读父舰生命周期/锁定输入、模块生命/停泊/退场/flux、weapons的类型/ammo/isDisabled（这些均不在瞄准循环改变）；Hyperion读effectLevel、冷却/在线条件；Adun读effectLevel。原始回调与辅助右递归/父舰左折叠/IEEE计算顺序不变，第一次仍完整合成。
所有目标/射程/盾心/原生Autofire/fire-budget读者保持已审核纯域；未知定义/方法覆盖/相位或伤害回调、非数据runtime、父链不合格回退。Runtime来源只允许普通/null原型的递归数值数据，描述符审计不执行accessor，不做永久资格缓存。系统getter/modifiers/available/isActive等原型与实例身份在准入检查，不在热getter重复检查。closed Worker不可注入函数/访问器，不是同realm恶意脚本沙箱。

## 预登记验收
本轮八文件写集（一个新模块），先before逐字备份和完整非campaign冻结，保留并发更改。不改Hz/精度/实体/画质/保护规则，不提交/打包/发布。
一次集中typecheck、改动lint和相关合同：176实体734挂点init/reinit/default真实span与合成计数；首次惰性读/跨挂点复用/不同武器类型及数值边界；父子/多槽/runtime值刷新与闭合后发射依赖变化；unknown callback/原型/实例/异常/嵌套/外来world回退；逐挂点aim/preAim/decide/隐藏tracker；60步完整状态；自然20/270步全状态及warm计数。只有具体失败定向修复复查。
正确性通过后唯一独立隐藏Node A0/B1/B2/A3，各150热身+120无插桩完整fixedUpdate，固定三舰2玩家+20AI/seed917/3200DP，四既有实验A/B同开。两组完整步各至少省5%、终态完全相同才保留；不重复择优或调整门槛。失败先核对全部当前/备份SHA及绝对路径，归档后仅回退本写集。通过才一次既有完整双无头浏览器功能验收；没有有效Hz/P95不宣称联机改善。默认仍关闭。

首次验证前静态复核补齐：复用既有nativeFireControlPrototypes一次性原型审计；实例侧拒绝自有phase/collision/visibility/shield/flux和runtime读者覆盖。native writer不能改方法/描述符，故不把反射移动到热getter。v1未做测试或性能计时，完整候选为v2。

首次测试前补齐不同world嵌套时lease.matches对底层read失效的可见性；未增加热getter审核。v3为首个待测完整候选，合同包含真实Worker启用与模块/父舰数值、IEEE和跨world撤销。

validation-v3合同无效：脚手架批量名称替换意外生成VITE_AI_OWNED_WEAPON_STATS，实际开关未开；真实Worker覆盖与合成计数门闩发现失败，未运行ABBA。修正为VITE_LAN_WEAPON_STAT_SPAN并增加构建文本开关断言，全部旧证据作废；allSystems覆盖夹具修正为返回合法数组的accessor（而非不合法function值）。生产字节未因这两项测试错误改动。
