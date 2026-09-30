# 主机相位能力审计结果（2026-09-28）

## 裁决
取得支持下一项结构优化设计的新证据；**本轮没有生产修改、没有测得提速、没有新增默认启用的优化**。旧LAN单槽免数组接线、系统列表单次分配、跨写域相位缓存均未复活；上一轮display扩展布局仍默认关闭。整体优化目标继续active。

基于当前冻结781模块、3498资源；Node v24.13.0固定路径。参考和观察各270完整五段（simulation/capture/encode/decode/apply），150冷步+120热步，所有旧模拟/呈现/AI/serializer/display-definitions和extra-display-layouts实验均false。2玩家+20AI、三舰循环、seed917、3200DP，初始176实体734挂点，最后169活跃实体。终态实体变化来自自然战斗，未减少测试负载。未动桌面、用户5173服务、原版文件、保护门槛或游戏Hz/精度；未提交/发布或打包生涯。

## 真实调用量
|模拟区间|舰船相位读取|系统相位读取|满足静态无相位定义条件|相位内系统列表构造|列表成员总数|
|---|---:|---:|---:|---:|---:|
|冷150步|17217208|35414326|35414326|17217208|34974526|
|热120步|14246865|29311955|29311955|14246865|28960115|

热系统读取中100%来自私有已注册纯stat定义且对象冻结、没有definition.phase和definition.isExecuting、没有own available/isActive/isPhased覆盖的原生ShipSystem。仅表示**值得进一步资格审查的静态无相位能力**，不是生产许可，不意味着所有Web舰船/未知mod都没有相位。

热态分布：NONE 23524133次，日蚀667631次，敕令4160061次，大和493745次，跃迁466385次。NONE在available已返回false，其余5787822次在isActive为false后返回。没有执行phase阶段公式。本场景自然推进未覆盖所有技能激活/替换边界，后续实现仍需专门合同。

热相位列表中，2成员13780480次，3成员466385次。模拟全部allSystems共20429041次，其中相位上下文14246865次；捕获另有281404次，不能算进模拟名单优化。父舰递归和列表/系统调用互相包含，**不能相加、不能把100%或调用减少比例当CPU、GC或速度收益**。

## 一致性与采集器修复
源码副本内插桩，没有包裹/替换运行时方法身份。ShipSystem原available→isActive→phase短路被拆为同序、同次数读取的三分支；保留全部返回值与状态读。Ship相位上下文用finally清理；每个完整步深度最终为0。原始与观察的逐帧wire流、冷/热总bytes、第20/270步完整authority+隐藏RNG/autofire以及receiver完整图一致。

- 源图：a29de955fe920366a94002e6a999d319b2b4ed7b6cc9b7709d6857d12d43902a
- wire：164b2b3c3ed75bd3e8a60800c5413fc744df3cc77c8725fe4c90b622b290a9aa
- 第20步authority+hidden：f6ee1edee84e4290292e64e9ff4efed3dfeb8b43e765ac9f9687e3b7267c9cb0
- 第270步authority+hidden：85a16ecc369edf51ae5f6b0cf48a8407b6623adac8736204cce52ae397114fda
- receiver：f8060d147374d9ab5de7df5f036b4e3a0b64c641755c2fa3f8c95828c1617128

初次reference已运行270步，但最终接收图采集器缺少ProjectedRenderShip导出，instanceof报错，没有保存完整结果；observed未启动。v1脚本/bundle/日志全部保留。v2仅在两份已编译bundle尾部导出已有类，未改游戏代码、插桩、冻结源或资源；增加启动前导出断言后重放参考并运行观察，通过。此次不是性能A/B，没有借修复择优选取计时。collector-repair.json记录范围。

## 下一方案必须比旧候选更实质
仅把单个ShipSystem getter换成快返回仍可能被准入/调用成本抵消。更值得验证的是**封闭Worker中整组技能的静态无相位能力专用路径**：跳过整条临时成员数组/逐技能状态查询，而不是缓存当前phase布尔值。原版依据见source-notes，API和反编译要求实时相位；本方案不能跳过父舰、护盾、停靠/撤退和外部相位Map。

实施前的硬边界：
1. 私有data-command Worker才可取得这种权限，普通公开对象、未知定义、getter/原型/自定义allSystems和数组语义保持原路径；“注册过”或同ID不是许可。
2. 只静态证明无phase且无isExecuting的具体不可变定义；有查询回调的系统不能为更快而少调用。
3. 主槽、额外槽、defense和definition引用的替换必须即时撤销/回退；不能沿用旧名单或旧负能力证明。需要保留读取期间槽位替换的既有快照语义和异常顺序。
4. 初建/重建、新生实体、真实相位技能、父子模块、外部效果插入删除、重入、异常、公开自定义回退与60步扰动完整状态/wire都必须先过。
5. 随后只做一次预登记完整五段ABBA；已有六类实验全部保持关闭以隔离本候选。离线不足不择优重跑；默认晋升仍需要生产式真实双客户端功能和延迟证据。

本轮只完成审计，不把这些约束冒称已实现或已验证。详细下一步边界已写入decision.json。

## 清理与漂移
测试脚本正常结束，保护输入无漂移；最终检测到8个冻结外后续源码差异，未覆盖，见source-drift-final.json。上一轮display候选四文件SHA仍相符，未改其开关。没有新增生产改动，因此未重复全项目类型/lint、ABBA或已知失败的浏览器测试。

工件目录：artifacts/lan-phase-capability-audit-20260928。主要文件：manifest-v2.json、frozen-browser.json、transform-audit.json、collector-repair.json、reference-v2-result.json、observed-v2-result.json、verdict-v2.json、decision.json、source-drift-final.json、final-state.json、remaining-processes.json。
