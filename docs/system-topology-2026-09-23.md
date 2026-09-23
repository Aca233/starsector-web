# 系统拓扑枚举去分配

实施前：真实48船authority采样6.145s，get allSystems自耗时1.71%，isPhased2.02%。原版0.98a ../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:5006–5008 isPhased直接读权威字段，5026起setPhased更新该状态；Web为了多系统/独立防御扩展每次实时查询组件。保持实时phase判断与回调时机，不缓存布尔结果、不改变AI/物理频率。

只对构造器拥有的原生systems数组缓存拓扑引用列表，组件状态仍每次读取。主系统替换、额外槽位增删/重排、防御替换都使枚举更新；自定义/替换的数组保留旧路径。缓存外置WeakMap，不进入联机快照。明确API调整：allSystems作为派生枚举成为readonly视图，稳定拓扑下返回同一冻结数组；调用方要可变副本需spread，不应通过该派生列表改装备。当前生产调用只读，无此写入。

原版实机不操作、UI不变，视觉实机等价仍待许可；完整同轨迹快照/RNG对照验证既有22船场景。必须整段实现后一次类型/lint/现有AI检查与配对整步测试；净收益为正才保留，不把getter微基准当整战收益。

## 结果：拒绝并撤回
类型/lint和40项AI契约通过，1200帧完整模拟/RNG与回放相同，changedFrames=0。但是3人22船整步mean 9.1240→9.4690ms（+3.78%），5人22船7.5453→8.0728ms（+6.99%）。没有用getter局部收益掩盖整步回退。Ship.ts与check-combat-ai.mjs恢复本轮前保存的确切内容；之前伤痕/guest restore/AI优化不变，readonly视图API调整也未保留。
