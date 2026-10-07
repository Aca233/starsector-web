# 剩余高 ms：根因证据与重写边界（2026-10-03）

## 结论先行
当前 Web **还没有真正按能力、数据依赖和生命周期执行规则**：数值 kernel 外面仍由可覆写的 Ship/Weapon 对象接口驱动，权限证明、可变元数据验证、关系展开和权限数组组装混进高频循环。上一轮停止模块自由机动，并没有拆掉这些执行成本，还新增了很重的资格路径。

这不是“关掉模拟速度限制”能解除的问题，也不是已证明存在一个占20ms的单独函数。当前证据区分：**可以重构的重复审计/准备工作**，和**不能凭优化名义删掉的76个独立防御、逐挂点射界/几何/资源规则**。本轮只定位根因，**没有修改生产代码、没有提速/60Hz结论**。

目标原版0.98a-RC8；C:/starsector-core、C:/decompiled缺失。以下是Web源码与后台实测，不是原版源码/界面/实机等价验收。没有桌面、子代理、生涯、提交/推送/打包/发布操作。

## 1. 上轮确实新增了反向成本：全面实例反射审计
源码：AttachedModuleMotion.ts:40–51 的 nativeMember、60–64 的全 roster create、74–84 的 accepts；66–72每plan构造原始world描述符集合。

当前窗口每步实测：
- 全 roster nativeMember **173.442次**，模块重复 nativeMember **56次**，合计 **229.442次**。
- 单此路径 Object.hasOwn **57580.975次/步**；实例属性 descriptor **2523.858次/步**、prototype **1153.208次/步**。
- 76次world bind，每次又取完整 descriptors。
- V8堆栈按时间片不重复归组：整个 attached admission 路径约 **2.238ms/步**。nativeMember/create/accepts/bind的包容数字相互重叠，不能再相加。

这是本轮最明确的工程问题：把无消费者求解换成了昂贵的通用反射检查。安全回退要保留，但安全域资格不应该在已准入的每个模块中再次全面证明。不是删门禁、写fast=true或跨tick缓存结果；应把事实证明放在**真实私有owner的阶段边界**，动态状态/角色变化仍单独检查。

## 2. 火控权限集合的身份模型导致重复准备
源码：FlightDecisionRoster.ts:36–41 每架craft fireShips复制 allies并插入target；ShipStepBatch.ts fire-query用 source.ships 数组身份分别创建roster；NumericAcquisitionFrame.ts:153–163再用数组身份建立scope/typed mask。

120步真实创建 **11567个scope**，只存在 **655个不同的有序row mask**（每个frame独立比较，绝不跨frame推定）：
- 每步建scope **96.392次**；真正不同有序集合 **5.458个**。
- **94.337%** 新scope重复同frame已有的有序权限集合。
- scope独占CPU约 **0.310ms/步**；roster constructor约 **0.388ms/步**。这是相关函数全部成本，不等于能全省，也不能包装成剩余20ms主因。

底层不是“需要再加一个WeakMap”：WeakMap已经存在，但生产者不断制造新数组，身份键自然无法识别相同权限。真正入口是在已核实的 native FlightDecisionRoster 生产者里显式表示 **team/ordered target permission group**，而不是消费端扫描/哈希每份数组再找缓存。普通/未知调用保留原数组路径。船员目标、友军遮挡权限和原顺序不能扩大或合并错。

## 3. 挂点元数据没有修订模型，数值输入仍反复冷审计
源码：AutofireController.ts prepareAimQuery；NumericAcquisitionFrame.ts:168–199 input/classes。compiled plane确实在运行，**120/120 compiledFrames，scopeFallbacks=0**，不是简单的开关没生效。

每步fire-query实际 prepareAimQuery **677.808次**。frame内classification冷构建 **566.617次**、命中 **86.508次**，冷构建占 **86.755%**。这里是元数据审计/分类冷构建，不是86%算法回退，也不是86%同一个挂点重复构建。

采样：prepareAimQuery包容约 **1.224ms/步**，Numeric input包容约 **0.714ms/步**；两者不能当独立收益相加。当前spec允许原地变更，缺少由真实修改入口维护的修订号，因此每个新frame都必须重新读属性描述符、分类并适配射程/弹速。

需要拆静态武器规则类别/可变refit元数据修订与即时幅能、角度、charge/cooldown状态。不能再试已失败的13字段ballistics WeakMap比对或query对象WeakMap命中缓存；新的执行入口应让**已准入native阶段使用按挂点索引的输入记录**，未知callback/原地未知变更仍走原路径。不能冻结用户现有可变spec来伪造安全。

probe的原始prepare重复计数跨AI/flight/fire三阶段合并，只描述工作量，**不作为跨阶段复用资格或可省时间证据**。

## 4. 查询工作发生在消费者决定之前
源码：NumericAcquisitionFrame.ts:220/普通preAim先tree.query，再把materialized rows传入WeaponAcquisitionKernel.ts:104–112。后者才先测试current，成功立即返回。

每步：
- BVH queries **538.1次**。
- current立即命中 **50.358次**，但候选树已扫描、排序、创建typed rows。
- 这些命中丢掉先前已产出的候选 **2700.525行/步**，占全部materialized candidates **44.895%**。
- query整个包容CPU约 **0.968ms/步**；44.9%候选行不是44.9%耗时，也不是整步可减44.9%。

必须按真实消费顺序解current，失败才展开候选，在已经获得的原生只读权限中保持原算术/顺序/范围。此项确定但局部，不能当整体根治。

## 5. 跨阶段的关系读取仍按部件/配对反复递归
源码：Ship.ts:241 allSystems每次新建数组；754/763 isCollisionless→isPhased→parent/allSystems；CombatEngine.ts:1116默认core关闭路径仍对组件双循环；ShipCollisionSystem.ts:111先读collisionless，再做距离broadphase。

每步实际读取：allSystems **26500.85次**，isPhased **21348.35次**，isCollisionless **11520.908次**。这三个getter独占CPU合计约 **1.722ms/步**，包容与它们的调用者不能再次相加。

其中shipCollision阶段外层collisionless读取 **5502次/步**，带来phase递归及 **9366次allSystems**。固定部件不该独立机动，但仍是真实碰撞表面，不能删除它们来提速。合适入口是assembly级保守候选/关系能力读面，而不是重试失败的getter-alias core/copied motion。

碰撞推挤会改变后续配对的姿态，terrain/dispatch/damage也会改状态，**不能用整tick缓存phase/dead/shield布尔值**。任何共享都必须有实际只读span或正确的变更失效与原配对顺序。

## 6. 必须保留的真实求解，以及旧权限耦合
实际assessThreats **76次/步**，投射物遍历 **7090.8行/步**，通过敌我/存活等首轮过滤 **3550.933行/步**。独立模块防御仍有消费者，不允许复制母舰结果或降频。assessThreats包容约 **3.222ms/步**，其中weapon kernel约 **1.279ms/步**，不能相加。

源码CombatEngine.ts:847–872 的projectile index仍绑定旧 nativeThreatPhase和>=128投射物条件；Registry.ts:73–82区分 legacy native与exact authored weak-set。实际初始重载模型：all legacy=false、all exact=true，拒绝来自22个根舰的已注册authored系统定义。新的同步exact read能力并没有自动赋予旧index能力。

因此“代码里已有index”不等于本路径用到了它。后续要为投射物只读查询单独核实能力/生命周期，**不能把这个资格与20Hz compact forecasting混为一个开关**。本窗也没有验证只放开旧门禁就会提速。

## 当前时间与被排除的猜测
本轮带500us V8 profiler的整步 **37.517ms**；fleetAI **12.754ms**、fire-query **10.144ms**。只是当前CPU采样窗口，不可与上轮无profiler ABBA均值33.938ms直接比较，也没有新提速结论。
- V8 GC采样约 **1.161ms/步**，不是本窗主因；不凭堆变化称泄漏。
- empty-weapon plan=**0**。不能声称173个射手都是空转、也不能删fighter/module火控。
- 没有证据支持把全部fire-query说成某一个角度/根号函数。8ms左右的fire-plan堆栈中混有准备、索引、目标排序和真实几何规则。
- inspector post在采样启停处的栈在tick外，排除在瓶颈解释之外。V8内联影响小函数栈归属，数字是近似CPU归因，不是精确硬时钟。
- host.worker.ts:444–510 的实际simulationMs还包含输入处理、可能的owner/threat worker等待及deferred消息；capture/encode另计。没有浏览器实际分项，不能用headless替代用户所有尖峰。

## 下一块应该重写什么
**优先重写已准入私有阶段的资格/元数据执行边界**，而不是再给每个小函数加缓存：
1. 在真实owner的native plan边界证明静态表面一次，产生阶段内私有资格；role/state动态失效仍live，未知/getter/扩展完整回退。阶段关闭后不能继续借权限。
2. 将生命周期/换组件/refit等真实修改与metadata revision连接；静态类别不因每帧姿态改变重复编译，即时幅能/盾/charge等仍在原规则点读取。
3. 权限集合由原生生产者给出稳定的有序group，不再让相同权限因新数组重复建mask/roster。不能凭DTO、数组内容或prototype单独授予权限。
4. 再考虑current-first懒候选和assembly级保守关系筛选；把准备成本和额外精算都计入净成本，避免重演被拒绝的粗cohort增加挂点访问。

这不保证单块就降到16.67ms；有效数学/防御/几何工作仍在。每块实现后仍须同场景完整行为对照和无profiler配对时间，不把计数下降当速度收益。

## 验证真实性
只后台读源码、一次当前源150warm+120 CPU采样、一次成功的270步函数body计数probe及一个初始metadata门禁模型读取。body插桩不替换原型；完整270终态原始快照+模拟RNG+视觉RNG与未插桩profile严格相同。计数probe耗时不作为性能数字。

诊断脚本的Windows URL转义、两处源码needle在场景运行前定向修正；不是生产故障。未测量的selectedThreats零值已移除；priority.calls由已测函数调用计数取值，避免冒充“实测零”。没有生产改动，未再跑tsc/lint、发布build或其它全套测试。九个审计生产文件哈希保持不变。

证据目录：artifacts/combat-root-cost-audit-20261003/ 的weighted-hotspots.json、work-diagnostic.json、audit-summary.json、manifest.json、legacy-gate-model.json和profile-witness.bin。
