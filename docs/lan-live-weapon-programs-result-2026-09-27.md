# 私有Worker实时武器属性组合程序：验收未过门槛并撤回（2026-09-27）

## 裁决
**不保留新的生产优化。** 有效v2通过全部7组正确性合同，但唯一无插桩ABBA两组仅省 **0.1875% / 0.6678%**，均不足事前约定的5%。不能把这两个微小差值当成稳定收益。没有重测择优、没有降门槛、没有运行浏览器验收。
五文件写集已完成逐字节SHA门闩回退；归档候选、恢复四旧文件、删除一个新增程序模块。所有同期其它修改保留。没有提交、发布、修改原版或改变Hz/精度/实体数/过载保护。大规模模拟与联机延迟目标仍active。

## 实现尝试
参见 `lan-live-weapon-programs-source-notes-2026-09-27.md`。这不是前一stat-span缓存：init编译不可变系统定义/辅助链结构，读取时调用原回调并作原有顺序的标量fold，六种武器stat均实时读取，不保存跨查询结果。
执行范围为22个已知自定义根舰，原生/NONE及父模块保持原路径；Worker之外及缺省不开。借现有owned-interleaved写域，阶段入口一次形状/拓扑审核，未知writer仍使整个域关闭。非空runtime、未知定义/访问器或结构变化回到原完整getter。没有复制倍率公式，没有用Float32。

## 真实失败与修复记录
validation-1：新增Map的prototype键被TS推断为具体实例联合而非object，typecheck失败；初版安装实例getter又触发RenderShipProjection的原生range-reader身份校验，真实host在tick0拒绝初始化。这批合同不算候选正确性证据，也没有进行性能计时。
v2没有放宽或修改RenderShipProjection。六个public getter身份保持原prototype方法，仅在ShipSystem中加入私有、非枚举、仅Worker注册的内部程序入口；scope外或无法优化时由原getter调用完整modifiers。Map键显式标注object，注册按先描述符后属性读取顺序拒绝未知访问器。写集增加ShipSystem.ts之前已核对当前字节与本轮baseline、追加before备份。
有效证据是validation-2：增量typecheck、修复文件lint、全部受影响7组合同均通过。脚本从构建文本断言准确开关`VITE_LAN_LIVE_WEAPON_STATS=true`，没有再次出现开关名称误写；bench证据门闩同时匹配case签名、冻结SHA及A/B bundle SHA。

## 正确性证据
- 真正host init与reinit均176实体、734挂点；候选实际准入22根舰，第一步执行78790次程序节点求值，缺省/基底均0。每个六stat public方法严格等于其prototype方法；内部入口不出现在可枚举字段中。
- 六字段×三武器类型，8轮生命周期/flux/auxiliary变化；在同一个scope内继续改变effectLevel/flux与runtime，实时结果相同，无query-value缓存。undefined/null/空字符串保持原中性值行为。
- 2662个纯算术合同覆盖三层右递归、加法/乘法、undefined、NaN、±Infinity、-0及capacity传递；该测试只调用数学helper，不伪装成Worker准入证明。
- 九类未知/动态回退：runtime及抛错runtime、实例available及抛错available、prototype available、实例modifiers、未知auxiliary、parent和flux getter；原回调序列/数值/异常相同。
- 公开world、exact-only无执行许可；相同world/不同world嵌套撤销；真实aim异常finally清除许可；下一writer被替换后先关闭再执行未知writer；辅助链替换不执行旧程序。
- 2202次逐挂点aim/preAim/decide中1671个非空aim；结果、隐藏tracker及RNG一致。
- 既有60步技能激活/靠近开火/排散/模块低HP逐步完整authority+隐藏state一致。
- 自然20步SHA `bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224`；270步SHA `bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6`。
- 两臂均2827次发射请求；自然终点101枚projectile、9条beam。程序共270个scope，无最终残留。

## 非计时计数
warm120中**主system.modifiers入口**2631588 → 1406215（少46.5640%），候选另执行1801682次实时程序节点求值；270步原组合入口6052343 → 3159841。这是全循环主system入口口径，**不同于上一stat-span仅瞄准段计数**，不能拿46.56%和95.6%作同口径比较。节点求值次数含辅助递归，不代表减少了同样数量的完整步工作。

## 唯一无插桩ABBA
2玩家+20AI，web_zhuyuan/web_gloriana/web_sc2_hyperion循环、seed917、3200DP；四既有实验两臂同开。独立隐藏Node按A0/B1/B2/A3，每臂150完整热身+120完整fixedUpdate(1/60)，不计启动/导入/热身/终态序列化。

|臂|120步累计ms|每步ms|
|---|---:|---:|
|A0|4446.4939|37.0541|
|B1|4438.1575|36.9846|
|B2|4357.9897|36.3166|
|A3|4387.2887|36.5607|

四臂均171活跃实体，完整终态SHA一致。`passesPrescribedGate=false`是性能裁决，进程exit=0不是性能通过。没有把测试中的计数或采样耗时用作速度验收；没有新浏览器Hz/输入P95数据。

## 并发修改与回退
初始基底739模块。v2冻结时有9个写集外变化（8修改、1新增），v2候选源图741模块；A/B共享这些同期内容，仅替换本轮五文件。它们是：
- src/engine/assets/CombatAssetClosure.ts
- src/engine/content/spear-of-adun-xl-art.json（新增）
- src/engine/content/SpearOfAdunArmory.ts
- src/engine/content/SpearOfAdunPack.ts
- src/engine/content/WeaponInstallation.ts
- src/engine/modding/ContentValidation.ts
- src/engine/render/webgl/passes/WebGLShipPass.ts
- src/engine/render/webgl/WeaponInstallationRenderer.ts
- src/studio/InstalledWeaponArt.tsx

回退前核对整个五文件写集当前candidate-v2 SHA、四份before SHA、解析绝对路径；归档五份后恢复四旧文件，删除仅本轮新增OwnedWeaponStatProgram.ts。写集外全部字节在回退期间不变。最终740模块与**有效v2参考图**逐文件相同（v2图去掉新模块并对四旧文件用before覆盖），上述9项保留。不把当前工作区误称为最初739模块的全字节恢复。

## 后续决策
不继续在这套stat读层微调分支、添加缓存或重新测同一候选。它已经验证了一种不同的结构实现仍无足够完整步收益。下一方向应回到现有profile中占比更大的完整火控候选扫描/几何求解路径，先核对已有否决记录（多线程火控、aim准备复用、预瞄空间过滤等），不要换名字重复已失败方案。任何新算法仍须保留目标顺序、tie-break、原算术、遮挡/权威校验和tracker/RNG，而不能靠跳过工作获得假提速。

## 工件
`scripts/check-lan-live-weapon-programs.mjs`（冻结历史重放）、`artifacts/lan-live-weapon-programs-20260927/`内candidate-v2-browser.json、validation-2/contracts/proofs.json、abba-once/abba.json、v2-concurrent-sources.json、revert-preflight.json、revert-verification.json、rejected-source。
本轮所有测试进程已结束；没有新启动的浏览器或服务。
