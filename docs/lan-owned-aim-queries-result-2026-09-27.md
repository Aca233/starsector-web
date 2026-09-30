# 单次 aim 查询准备：验收与撤回（2026-09-27）

## 裁决
**不通过，七文件生产候选已精确撤回；实验没有启用，不运行浏览器，不提交/推送/发布。**
唯一 ABBA 两组节省 2.9736%、10.2171%。门槛事前约定为两组各至少3%；第一组低于3%，不得四舍五入成通过，不择优重测、不更改门槛。脚本退出0只表示四臂执行和终态一致；真实判定字段 passesPrescribedGate=false。

## 实现范围与行为证据
试验仅将同一次 AutofireController.aim 的 AimQuery 惰性准备一次，未缓存到下一挂点/帧，未改变预瞄、目标选择、炮塔追踪、随机数、弹体、精度、Hz、过载保护或画质。借用 owned-interleaved 写域和父舰/载机连通组；未知读者回退，租约必须在实际发射前关闭。
原版来源和已有Web时序差异见同日 source-notes。此轮没有原版实机验证、没有UI变更，不宣称原版完全等价。

- 七文件候选及726模块基底冻结，candidate-browser.json包含727模块。
- 一次生产 tsc -b / 改动lint：退出0；测试脚本修复后只定向lint脚本。此检查发生在本轮时点，不为后来其它任务的并发改动作保证。
- 有效 contracts-2：8/8通过。真实init/reinit/default均176实体、734挂点；开关启用时每初始步78个租约，默认与A臂均0。
- 纯数值runtime允许，但动态变accessor、函数、symbol、异常原型及超深对象拒绝，描述符审核不执行getter。旧preAim门槛未放宽。
- writer/父舰/载机依赖、预算与名单引用不符、重复活动writer、嵌套scope/lease、关闭后再入、exact-only工厂和未知回调顺序/异常合同通过。
- 2202次逐挂点aim比较，990个非空解，完整结果、tracker和RNG相同；prepare调用27450→1394。
- 35步实际近距场景：1114次发射请求、终点130弹体25光束，2730次租约均在请求发射之前关闭；原生方法源码注入异常后finally也清理租约。
- 60完整fixedUpdate逐步比较authority+隐藏tracker/RNG，包含系统激活、近距开火、排散和低血模块封舱，全部相同。

## 诊断（不是性能收益）
|范围|A prepare次数|B prepare次数|减少|
|---|---:|---:|---:|
|前20完整步|129265|18559|85.6427%|
|270完整步|1522400|256612|83.1442%|

B共270个phase、21060个lease；150热身后120步仍9360个lease，排除了只在启动时生效的空验收。两臂20步和270步完整终态均相同。
20步：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
270步：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。
调用减少不能当作等比例提速。资格审核、分配和其它热路径成本及环境噪声可能影响总耗时；本轮没有做其因果分解。

## 唯一无插桩 ABBA
每臂独立隐藏Node；三舰循环、2玩家+20AI、seed917、3200DP；四个既有实验两边同开，唯一差异是新候选。每臂150热身+120完整fixedUpdate；不含启动、导入、热身和末尾见证开销。

|臂|总耗时ms|每步ms|
|---|---:|---:|
|A0|4826.5270|40.2211|
|B1|4683.0068|39.0251|
|B2|4433.4793|36.9457|
|A3|4937.9984|41.1500|

四臂无__aimProbe、构建SHA匹配合同构建，终态同上，均171活跃实体。这是Node离线墙钟，不是浏览器Hz、CPU占用或联机输入P95。不得用一组10.22%掩盖另一组未过门槛。

## 测试失误与纠正留痕
contracts-1无效：复制夹具时新VITE名称错写为VITE_LAN_OWNED_AIM_QUERIES，未真正开启生产开关；另外预算属性是getter，需defineProperty而非Object.assign，未知budget异常要用AI火控模式才会进入该路径。未改生产代码、没有运行性能ABBA。
修正为VITE_AI_OWNED_AIM_QUERIES，证据门闩增加before/after构建SHA。由于全局构建开关错误，旧合同证据全部作废，正确构建集中复查得到contracts-2。没有将旧60步“通过”冒充候选通过。

## 回退与并发工作保护
回退先核对本轮七文件candidate SHA、六个before字节及路径；已归档到 rejected-source，恢复六旧文件、删除仅新增 OwnedAimQueryPhase.ts。本轮写集无漂移。
第一次尝试在任何归档/生产写入前因写集外漂移停止；检查确认与本轮无交叉后，仅撤回本轮内容，保留并验证以下10个其它任务/用户改动：
- src/engine/assets/CombatAssetClosure.ts
- src/engine/content/ShipSpec.ts
- src/engine/modding/ContentValidation.ts
- src/engine/render/ShipRenderState.ts
- src/engine/render/webgl/JumpTargetingRenderer.ts
- src/engine/render/webgl/passes/WebGLShipPass.ts
- src/engine/runtime/local/RenderWeaponDictionary.ts
- src/engine/simulation/Weapon.ts
- src/engine/visual/HulkVisuals.ts
- src/studio/ShipStage.tsx

旧基底清单726模块中716仍字节一致，其余10保留并发修改。**不能说整个当前工作区已恢复到旧726模块基底，也不能把旧冻结夹具当下一轮当前基底。** 下一候选需要从当前工作区重新冻结、核对负载；不要原样复活或再跑本候选。

## 工件
- scripts/check-lan-owned-aim-queries.mjs：历史冻结重放；默认仅合同，bench需要全部匹配证据。勿再次启动ABBA。
- artifacts/lan-owned-aim-queries-20260927/contracts-2/proofs.json：有效八项合同。
- artifacts/lan-owned-aim-queries-20260927/abba-once/abba.json：唯一性能裁决。
- artifacts/lan-owned-aim-queries-20260927/revert-verification.json：写集回退、并发改动保存和无插桩验证。

## 未完成
此轮没有保留新的生产优化。没有浏览器新结果、没有稳态Hz或有效输入P95；大规模联机速度/延迟目标仍active。下一方向仍需着眼完整火控扫描通路，而不是靠命中次数或CPU占用率证明收益。
