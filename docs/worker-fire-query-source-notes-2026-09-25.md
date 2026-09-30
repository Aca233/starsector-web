# 独占 Worker 火控查询域：修改前来源与边界（2026-09-25）

## 原版证据 → 行为
本机 0.98a-RC8。修改前再次阅读 decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:236–267：空间候选、阵营/可攻击性/可见性/角色、距离、拦截/射界及指定目标优先；combat/systems/WeaponGroup.java:301–315：逐武器推进 AI 并独立 shouldFire。反编译存在类型异常，不照搬异常表达式。当前 Web 的 aim/decide 批次在实际发射前运行，不等同于原版全部次序；本轮保持当前行为，不把该差异包装成原版等价。不改 UI，不作原版实机/视觉验收。

## 问题与新边界
旧通用 FireControlQueryRoster 的全对象/武器属性反射和逐舰重新审计曾抵消收益；其 ArmorGrid.cells 资格失配保留不动。本轮不是修正该门槛后对所有引擎重新打开旧方案。

生产 local-combat.worker.ts 的 kernel 是模块私有变量；消息只能 structured-clone 数据，命令不接受行为函数/可变 Ship/System 引用。init 与恢复都创建自己的 LocalCombatKernel；所有发射、伤害、更新函数来自 Worker 自己的模块图。内容可以是数据型舰体/武器，不能携带自定义 getter/回调。普通 LocalCombatKernel/CombatEngine 则公开可变对象，不能获得此保证。

本轮拟增加模块私有 WeakSet 的显式 Worker 所有权登记，仅由生产 Worker 的 init/restore 分支调用。无用户配置开关、无从内容 DTO 读取权限。WeakSet 不是同 realm 恶意代码的安全沙箱；调用登记的代码必须拥有从未向可变扩展暴露的引擎。若未来 Worker 增加可执行插件入口，必须撤销/禁用此登记或重新建立读域证明。

## 共享域与失效
- 引擎已有 nativeThreatPhase、combatEffects、引擎/部署方法与名单 getter 检查保留。普通引擎仍保留原有全部反射审计。
- 仅 Worker 登记的引擎、且不少于100舰时，可建立独占 roster；不做逐武器描述符反射，也不冻结可变 WeaponSpec。
- 每舰 batch 仍在 ShipWeaponControlSystem 完成运动/系统/组件维修以后建立，try/finally 在发射/幅能开销之前关闭。每舰重新查询，不缓存整 tick 的动态状态。
- 每次 begin 仍对当前名单检查原生威胁/射程/系统读钩子、runtime modifiers、父舰/舰载来源、辅助系统关系、拦截器及多系统边界。上一个舰船 update 安装的未知回调、临时效果、替换的定义等会在下一 begin 回退。原生、私有 Worker 保证普通字段/武器数据没有调用者 getter，不能拿这条约定替代通用引擎的审计。
- 复用现有事务内目标名单/目标资格、友舰阻挡和在途弹药阻挡查询。只共享本域中纯读取的状态；角色、射程、提前量、射界、精确几何、选敌排序与发射前实际幅能预算仍逐武器执行。不重新引入已否决的预瞄范围树。
- 原生 NativeAim/范围/系统只读回调、fireTargetUtility、InFlightFireBudget 的预测计算不写目标权威状态；武器追踪器/炮塔角写入不影响舰船通用目标资格。外部伤害/相位回调及外部系统/射程定义不能进入此域。
- batch.close、roster.close、名单/射手不匹配时继续失效；重放恢复入口必须登记相同模式，避免正常运行与恢复路径分叉。登记不存入快照，不改变 RNG、数量、精度或时钟。

## 验证
先冻结当前完整源图。扩展既有 check-combat-ai：通用引擎不晋升、原生真实百舰域可建立、重复候选复用、跨舰动态相位/死亡/可见性/阵营刷新、关闭/名单失配、外部钩子/临时效果/非原生系统和元数据回退；与无 batch 控制器比较逐挂点选择/预瞄/发射决定及 tracker/RNG。原有自定义 getter 和可重入用例必须仍通过。

一块实现后集中 typecheck、改动文件 lint、此既有场景。既有真实 Worker 基准做一次200 Onslaught配对（150预热+180测量），比较显示全图/权威/隐藏火控/RNG。另用测试构建插桩确认生产登记与 batch 真正被使用，不将插桩计时当性能。不得因结果差反复重测寻找有利样本。没有整体收益就撤回本候选，不宣称GPU/多核火控或Worker呈现迁移完成。不运行联机输入事件 fixture，不提交/发布或替换安装内容。

## 补充回退场景（测量前）
主目标200 Onslaught配对已完成且状态一致。新路径对有舰载来源的单位整域回退，因此补做一次24主舰 Legion/Onslaught 混编（包含真实生成舰载机）的既有 Worker 配对，120预热+90测量，专门检查回退开销与完整行为。它不是重测主目标以寻找更好数字，也不启用输入事件 fixture。若出现实际回退开销问题，再按具体失败修复，而非直接泛化主目标的收益。

## 验收更新
本地默认Worker候选保留：主目标模拟均值-12.31%、P95-11.99%，往返+解码均值-10.32%、P95-9.46%。46项检查、104挂点/状态对照及两个真实Worker配对的完整状态均一致。航母控制场景实际168单位，短probe确认资格回退而不是未达阈值；正常启动/恢复均一致。范围仅local-combat.worker；独立的LAN host.worker尚未接入。详细性能/限制见 `worker-fire-query-performance-2026-09-25.md`。
