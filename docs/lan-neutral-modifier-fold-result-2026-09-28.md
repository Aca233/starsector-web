# 空修饰器折叠：未达门槛并精确撤回（2026-09-28）

## 裁决
不保留新的生产优化。有效v2的7组正确性合同通过，但唯一ABBA的热配对改善为 **1.1876% / -0.2406%**，均未达到各至少3%的预登记门槛。第二组是回退，不是收益。未重测择优、未降门槛、未运行浏览器。默认开关、过载保护、60Hz/精度/实体规模未改变；没有暂存/提交/发布或改原版安装。

唯一生产写集ShipSystem.ts已逐字节恢复到实施前WIP：5a38de44f46a27d5f26ca973fc32eb0b9988aa5735ef05eff29335e1a1a7854b。候选归档SHA d4181e495d85362169ec94bf01820356a20cc5b795a12a5c10e5b787f1e6eedb。撤回期间写集外文件无变化；相对v2冻结源的其它并发变化：无。现行代码没有VITE_AI_NEUTRAL_MODIFIER_FOLD；不是仅把候选关闭后留在热路径。

## 先纠正空命中，再验收完整步
v1私有空标识只处理引擎自己生成的空记录。真实首步52412次辅助组合全部是neutral/value，0次neutral/neutral；A/B/default Object.keys同为209844。虽然合成双空技能能命中且真实场景346次直接返回内部空对象，它们都不能证明省掉了组合。v1没跑性能计时。

v2核实HyperionSystems.ts:18–22,85和Registry私有定义身份，只在已注册Jump passive回调实际执行完后识别其空字面量；非空奖励、未知定义、ID伪装、继承weapons全部保留原路径。没有跨查询数值缓存、没有跳过任何技能回调；公共callback返回身份不改，公共readNativeMotionModifiers重新物化新鲜结果。来源与边界见lan-neutral-modifier-fold-v2-source-notes-2026-09-28.md。

## 正确性与实际调用量
一次v2typecheck与单文件lint退出0。前4组合同一次通过；新边界夹具先遗漏owner.hullStats，补齐后又发现原实现的maxCooldown被缺失倍率变为NaN。补齐全部构造器所读中性stats后，只定向跑失败的第5组及尚未跑的host/60步组；生产代码未因此改变，未重复完整场景。有效汇总contracts-valid.json引用同bundle的前4组原证据。

7组覆盖：2000个有序技能链/特殊值；300组访问器、Proxy、抛错、父模块/runtime/重入；公开复合对象新鲜身份和修改隔离；继承weapons和辅助槽回调内替换；实际Jump奖励冷却边界/到期/排散/disableSystems/原callback返回身份/伪装ID并临时换原生definition；真实host init/reinit/default（176实体734挂点）；60完整步逐步authority+隐藏RNG/autofire一致（技能、靠近交火、排散、模块低HP）。

第一个完整步非计时Object.keys计数 **209844 / 131428 / 209844**（A/B/default），候选少 **37.3687%**。这是调用量，不是分配字节、GC耗时、模拟提速或网络P95。60步完整终态76e3d71b47b08a2f60757b57dab22c6a33e0d33226bd8bb2b115b9490d79fba9。

## 唯一无插桩ABBA
Node v24.13.0，固定C:/Program Files/nodejs/node.exe；当前776模块SHA 01e9493ee476e5a71f71b28e627cfb854dc02e2d88497985648d1841498f2470。三臂同依赖/资源冻结，3489资源；所有五个既有模拟实验及呈现/AI/序列化Worker实验关闭。2玩家+20AI、三舰循环、seed917、3200DP；独立隐藏进程各150热身+120计时完整fixedUpdate。

|臂|冷150步ms|热120步ms|热步均值ms|
|---|---:|---:|---:|
|A0|7440.7965|6453.1974|53.7766|
|B1|7537.0159|6376.5607|53.1380|
|B2|7432.5043|6477.4193|53.9785|
|A3|7557.9198|6461.8714|53.8489|

热配对1.1876% / -0.2406%，冷回退1.2931% / -1.6594%。冷/init通过，热门槛失败。八次边界冻结输入审核通过；终态与资源读取四臂一致。
20步SHA bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224；270步SHA bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6；末态171实体。

没有候选CPU因果采样，不把小幅时间差归因于某个已证明的GC/JIT/审核项，也不能用该失败证明所有对象池无效。不把此次结果与旧旗标/旧Node/开发浏览器实验百分比相加。目标仍未完成：尚无新增有效稳态Hz、输入延迟或联机通过证据。

## 工件与测试工具失误
- artifacts/lan-neutral-modifier-fold-20260928：v1冻结源/候选、激活诊断和合同尝试。v1工具曾在Object.assign时提前触发预设抛错getter、误用已不注册的旧技能ID、复用wx报告路径；均留痕，不作为性能数据。
- artifacts/lan-neutral-modifier-fold-v2-20260928/contracts-valid.json、validation/：有效7组及类型/lint。
- 同目录abba-once/abba.json：唯一性能裁决；rejected-ShipSystem.ts和final-state.json：精确回退证据。

下一方向不应再把枚举减少或合成场景命中当交付，也不原样复活此候选；必须以完整默认路径预算为准，避免继续叠加小型缓存/资格检查。
