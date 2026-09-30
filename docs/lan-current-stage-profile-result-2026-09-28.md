# 当前默认路径：分段CPU与技能AI输入需求审计（2026-09-28）

## 结论：找到不同于旧缓存方案的下一处整批工作

没有生产改动或新增提速宣称。已确认 `CapitalShipAI.update` 为当前三舰四种技能预先求值的 `tactical.forwardClear` **没有任何读取者**：自然150冷步3900次、120热步3120次、60扰动步754次，全部0次读取。真假值都有出现，不能说它恒真；应通过消费需求省掉整次查询，而非近似其结果。

该结论改变下一行动：设计私有Worker、原生技能回调的**未消费输入消除**，删除已证明不需要的假设ACTIVE修饰求值和前向通道扫描；不再复活相位缓存、运动小缓存、导航索引或资格租约旧候选。尚未编写生产候选，也尚未证明删除之后的行为或净性能。

## 当前来源与采样口径

当前782源码文件逐字/逐SHA与上轮static-phase-slots真正before相同，依赖和3498资源同样核实后复用before bundle。新冻结源码SHA fcc78dc9d747f79bd985a2569469cc80217b2a78f73a82af3695481b160559c2；bundle 2cacd4d63081e5025a7dd3dc10c78f77fdeafdaacc76ff895c4193069fbdf4dc。固定Node v24.13.0，真实host init，2玩家+20AI、三舰循环、seed917/3200DP/60Hz；其它实验全部关闭。

完整五段运行270步，150冷步后在120热步开启一次inspector。请求500us，实际 17501 样本，总timeDeltas 18753.936ms，平均 1071.6us。分段为栈上有对应wrapper的样本；不是未插桩墙钟或浏览器性能。inclusive各桶重叠，不可相加。

|当前默认路径调用栈|inclusive ms|占模拟wrapper样本|
|---|---:|---:|
|CapitalShipAI.ts|4637.778|51.27%|
|ShipWeaponControlSystem.ts|2353.447|26.02%|
|ThreatAssessment.ts|2336.532|25.83%|
|ShipMotion.ts|1485.409|16.42%|
|TacticalNavigation.ts|1181.836|13.07%|
|TacticalNavigation.ts|647.850|7.16%|

`combineSystemModifiers` self831.927ms（模拟样本9.20%）、`ShipSystem.modifiers` self530.893ms（5.87%），仍不能把inclusive与self相加。比起继续优化低层getter，更具体的方向是删掉没人使用的上游查询。

五段wrapper采样：simulationStage 9045.621ms；applyStage 3353.563ms；outside 2577.231ms；captureStage 1932.274ms；encodeStage 1211.201ms；decodeStage 634.046ms。outside中2366.670ms为GC，约占全部样本12.62%，没有调用栈依据将它全部归给模拟或接收端。此次覆盖完整链路，与旧simulation-only/浏览器冷启动样本分母不同；不能用它声称GC恶化或池化收益。

## 读取观察与行为对照

观察副本仍按原时机执行完整 `forwardPathClear`，只把已经求好的 `forwardClear` 数据值包装为计数getter，再传给四种已审核原生回调。没有跳过任何扫描或改数值。`prepared`记录同时证明那些假设ACTIVE modifier求值只服务这项输入。生产源码不变。

|窗口|预计算通道次数|对应假设修饰求值|forwardClear读取次数|
|---|---:|---:|---:|
|cold|3900|3900|0|
|hot|3120|3120|0|
|stress|754|754|0|

热段按定义：Eclipse840、GlorianaEdict840、HyperionYamato720、HyperionJump720，各自读取0。源码交叉核对：Eclipse → advanceWeaponBoostAI 不读取；Gloriana、Yamato、Jump的advanceAI均不读取。SystemAI.offensiveManeuverAllowed和advanceJetsAI会读取，绝不能对所有技能或所有未来定义一律省略。

采样副本、读取观察副本均与相同冻结未插桩A0的逐帧拼接wire摘要、tick20/270完整authority+隐藏RNG/autofire、最终receiver图、实体数和累计字节一致。另一次真实reinit后60步技能/近距/排散/低HP扰动，全部61帧wire摘要序列及tick20/60权威/隐藏/receiver与既有三臂合同完全相同。后者没有再次逐步核对完整权威图；不得扩大为本轮每步权威证明。

测试留痕：观察构建v1的测试文本变换少了一个对象闭括号，在esbuild解析时失败，游戏尚未运行。仅修脚手架并保留v1和repair记录；生产没有修补，没有择优重跑。

## 所有权与下一步边界

只对私有data-command Worker登记实例和审核过的定义身份开放；普通引擎、外来world、新实体/替换定义、未知方法/phase/motion/getter、noteNavigationObstacle或未知索引保留原急切计算路径。即使消费者不用结果，陌生计算回调仍可能有副作用，不能绕开。对象相同ID不赋权。许可检查必须位于一次AI输入需求决策处，不放到每个目标/每次getter。新方案不缓存任何导航结果、不改避碰、开火安全、Hz、实体、精度或保护。

原版API `ShipSystemAIScript.java:7-8` 给技能AI提供危险方向与目标，而Web新增forwardClear为派生建议输入；本轮仅核对Web四个原创技能的实际读取需求，不声称原版实机/UI等价。本轮未做桌面操作、未发布/暂存/打包生涯、未动用户Vite。无生产修改，故不额外重复typecheck/lint。源码最终漂移：src/engine/content/HyperionIds.ts, src/engine/content/HyperionPack.ts, src/engine/extensions/HullMods.ts, src/engine/extensions/ship-systems/HyperionSystems.ts, src/studio/ExtensionVariantCatalog.ts, src/studio/HyperionLoadouts.ts。

证据目录：artifacts/lan-current-stage-profile-20260928。profile/verdict/cpu-summary/context-result/context-manifest/observation-build-repair均已保存。

### 收尾时并发源码更新

其它任务在本轮冻结之后更新了6个文件，包含HyperionSystems/HullMods及休伯利安内容配置。上述CPU和计数只属于已核实的782模块冻结图，不能直接当作这些更新之后的性能。旧/新SHA和完整差异保存在concurrent-source-changes.json，未覆盖任何一项。下一候选必须重新冻结最新图，并重新审核休伯利安技能消费者。
