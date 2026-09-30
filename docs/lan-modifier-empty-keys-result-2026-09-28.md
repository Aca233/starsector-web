# 技能修饰空字段枚举：未通过整步门槛并撤回（2026-09-28）

## 裁决
**不保留新生产优化。** 唯一完整ABBA的两组热段观测分别慢0.4756% / 12.1181%；两组至少省3%的预登记门槛失败。没有择优重测、改门槛或追加浏览器运行来挽救结果。原文件逐字恢复，VITE_AI_SKIP_EMPTY_MODIFIER_KEYS已随候选撤回；其它既有实验默认状态未动。

本轮没有降低Hz/精度/实体/画质或改变原始属性运算/过载/权威保护，未提交、推送、打包或发布。大规模模拟与联机延迟优化仍未完成。

## 新方案与前置失败
原版API依据、算术与访问序约束见lan-modifier-empty-keys-source-notes-2026-09-28.md。唯一写集src/engine/extensions/ship-systems/Modifiers.ts：单次合成中保存首次b.weapons?.[type]读取，若其nullish则跳过Object.keys({})；非空仍依次枚举、通过原b.weapons[type][key]读取值。保持返回对象/三个武器类型空对象的新鲜身份及字段枚举结构，不缓存属性值、不新增资格审查，不改变系统调用和左右折叠顺序。

初次build在任何bundle、合同或游戏开始前发现其它任务改变了资源清单；不是性能失败/重试。保存原build-v1、前置失败和旧源图后，重新捕获实际当前源/资源。不借用前一炮组调查的旧资源验证新源码。

有效快照776模块，源图SHA256 4b6a81a161492b3d0491eb73a3141b30ec033bfc33caeb95929bf09e0a1f038f；3488完整资源、156246928 bytes。固定C:/Program Files/nodejs/node.exe v24.13.0。before/on/default三臂共享同一冻结源、外部依赖与资源，仅本文件旧/新版本及该开关不同。五项既有模拟实验全关，其它Worker实验同关；不能与旧四/五项全开实验绝对时间相除得回退或累计收益。

## 集中验证
一次typecheck、该文件lint均退出0；6组正确性合同均一次通过，无合同修复重跑：
1. 20000组数字/缺字段/键序组合，覆盖undefined/null/NaN/±Infinity/±0/极大极小值，保留a的symbol。
2. 返回结果、weapons与三类武器记录每次新建；自定义类型原浅拷贝别名仍保留，输入不被修改。
3. 225组访问器/Proxy动态变化及不同位置抛错，逐次读取轨迹、结果/异常严格一致。
4. 1500组右递归/左折叠及继承属性场景一致；不改变浮点结合次序。
5. 真正host init/reinit/default，均176实体734挂点，完整初态相同。
6. 60完整fixedUpdate逐步before/on/default权威+隐藏RNG/autofire一致：第8步技能、第20步近距交火、第30步排散、第38步模块低HP。

性能结束后，另对**同一未修改bundle**做非计时激活探针：全部缺失武器类型时Object.keys调用4→1；仅一类存在或两类nullish时4→2；默认仍4，结果相同。它确认真正启用了分支，并非开关名误写；不是额外性能试验、不是GC字节或实际堆分配测量。该探针用临时计数包装内建函数，不能据此宣称优化与任意篡改Object.keys实现的外部行为等价。

## 唯一无插桩ABBA
各独立隐藏Node进程、2玩家20AI原三舰循环、seed917、3200DP；各150完整热身+120完整热步（dt=1/60）。计时不含启动、导入、末态序列化；没有render、网络/IPC或CPU profiler。

|臂|初始化ms|冷150步ms|热120步ms|热步均值ms|
|---|---:|---:|---:|---:|
|A0 before|102.3815|7935.9650|6767.4929|56.3958|
|B1 candidate|102.4903|7769.4772|6799.6795|56.6640|
|B2 candidate|104.5912|8789.0954|7589.5665|63.2464|
|A3 before|101.7364|7827.1277|6769.2582|56.4105|

- 热段节省率-0.4756% / -12.1181%，均未达+3%。
- 冷段变化-2.0979% / +12.2902%；第二对也未达“不慢超过3%”。
- 初始化增加0.1088 / 2.8548ms，在各自10.23815 / 10.17364ms门槛内，不能据此覆盖热段失败。
- 四臂第20步完整状态SHA：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
- 第270步完整状态SHA：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6；自然末态171活跃实体，读取资产SHA一致。
- 八次执行边界核验中保护输入、当前源图均无漂移。numericGatePassed=false、inputAuditPassed=true、passesPrescribedGate=false。脚本exit0仅表示对照执行和一致性校验正常，不等于提速通过。

这组数据没有候选热点/JIT/主机调度的因果分解，不能断言额外分支、临时分配或系统负载中的某项就是12.12%的唯一原因。也不能把第一对的小差值视为“基本持平，可以上线”。没有浏览器Hz、输入P95或真实LAN/WAN改善证据。

## 精确撤回与后续边界
回退前核对候选SHA a05d6aefe269aabb64c7c0f6e20643adb330c76be1abfde489d4a15aeca9c5dd、备份SHA与工作区绝对路径；归档rejected-Modifiers.ts后只恢复这一文件，恢复SHA为36a6d1f0a33c8bbef96373725f6365a128726b45827622d850b608175d6f0633。回退期间写集外文件逐SHA未变。

ABBA完成后其它任务修改src/engine/content/adun-ark-aircraft-art.json和AdunArkAviation.ts，均保留；未将776模块快照强行写回最新源树。当前仅新增文档与工件，不保留本候选生产改动。无浏览器或常驻服务被启动。

本轮前半段的炮组评分调查也已排除：重复计算比例很小，文件级采样不能误当整个combatProfile函数占比。两项结果都支持停止凭局部循环/分配次数推断整步收益；后续候选必须处理真正大量重复的AI/火控输入准备及其数据组织，同时避免已验证昂贵的读域反射/家族审核。不能原样恢复旧缓存，或用小场景/更宽过载门槛替代大场景目标。

完整证据：artifacts/lan-modifier-empty-keys-20260928（preflight-failure.json、*-build.json、preregistration.json、validation/、contracts.json、activation-proof.json、abba-once/、revert-preflight.json、final-state.json）。
