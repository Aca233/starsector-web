# 默认 LAN 全链路采集成本审计（2026-09-28）

## 结论与下一行动

本轮完成了**当前默认开关下的270完整步 simulation→display-v1 capture→binary encode→decode→apply 观察**，与独立未插桩参考逐帧累积二进制、20/270步权威+隐藏 RNG/tracker、末态接收图完全一致。**这是新瓶颈证据，不是新增默认提速，不是计时A/B或真实联机验收。**

预想的两个新小候选（跨帧不可变规格签名、display装甲格网缓存）确有高度重复，但各自仅占捕获的小部分，尚不值得马上增加缓存许可/协议适配。没有将它们落进生产，更没有拿减少复制/字符量宣称FPS提升。下一结构性方向应验证**减少 capture→encode 中间 Wire 树及重复遍历**；接收端 unpack/恢复仍是重要开销，不能以跳过 assertDataField、定义/资源/预算校验来消除它。已否决的挂点值行、标量验证分离、自有字段分支和v2片段驻留不能原样重做。

## 来源与固定环境

原版0.98a-RC8 ArmorGridAPI.java:11–36定义逐格float值与grid；本次不删格、不量化、不降频。网络打包是Web层，没有原版同名实现；原版实机/UI未验收。

- Node v24.13.0，C:/Program Files/nodejs/node.exe；全部工作后台、无子代理、无桌面。
- 777模块，SHA cf745b550d940c1bb49552617554cc7467dbf495e57c7ceba24453817c8cdfd1，3489资源冻结；所有既有实验显式false，包括五项模拟实验、display definitions、呈现/AI/serializer Worker。
- 真实host init/reinit语义、2玩家20AI、三舰循环、seed917/3200DP；初始176实体734挂点，末态171实体。
- 参考一次270步；观察一次270步，150步自然热身后120步单次CPU采样。仅artifact bundle原方法体中增加计数，不改变方法身份、回调输出、顺序、协议或战斗结果。
- 初次构建在插桩字符串锚点处失败，未启动模拟；修复锚点并复用原冻结源后成功，无择优性能复测。

## 装甲观察不能被见证工具污染

旧测试助手用 generic authority capture 读取 armor.cells，会将“公共可变数组曾暴露”标志置为true，影响后续 ownedArmorGrid 资格。因此本轮 witness 改用原生、packed-numbers完整authority采集，利用已存在的ArmorReplication路径；实际检查tick20采集前后所有grid revision/暴露资格完全不变。它仍不是display快照，隐藏RNG/autofire见证继续独立包含。未修改生产ArmorGrid或快照逻辑，未重置私有暴露状态。

## 两个重复工作点

|指标|cold150|warm120|
|--|--:|--:|
|规格JSON签名调用|2250|1800|
|签名字符总数|14610450|11688360|
|重复对象签名调用|2235|1800|
|签名结果变化|0|0|
|装甲copyCells次数|26400|21027|
|复制bytes|31298400|24989616|
|同grid revision未变复制|26212|20872|
|已暴露/不合资格复制|0|0|

15个唯一spec对象全部为注册不可变数据，观察中纯数据/无自有toJSON，所有4050次签名均稳定；这不证明任意扩展、原型toJSON或稀疏数组都可缓存。

warm120签名调用内部计时共 76.961ms，约3.875% 的观测capture墙钟（约0.641ms/帧）。时间含插桩/Profiler，不能与参考墙钟相减作收益。CPU采样对JSON内建/内联归属不稳定，因此不将auditSpecSignature采样小值与这段内部计时等同。

装甲资格100%，warm 99.263% 复制时revision未变，重复复制 24875376 bytes（约23.723MiB/120帧）。CPU样本copyCells 36.349ms、全部PackedSnapshotNumbers.capture 50.390ms；后者不全是装甲且两桶可能重叠，不能相加冒充装甲必省时间。支持“有重复”，不支持“大幅提升整体模拟”。

## 当前大头（最后120步，含Profiler）

以下为同一次CPU样本的inclusive归因，不是机器CPU占用率，各嵌套桶不可相加：

|区间|样本ms|总样本占比|
|--|--:|--:|
|simulation|8366.633|50.575%|
|capture|1932.685|11.683%|
|encode|1250.325|7.558%|
|decode|657.157|3.972%|
|apply|3309.103|20.003%|
|gc|776.272|4.692%|

capture内部：pack递归 1133.617ms、LanShipProjection 653.243ms（包含部分子调用）；receiver热点为unpackDisplay、unpackRecord、assertDataField及定义visit。旧手工/生成记录恢复已经存在，不能把整个unpackRecord时间当成“尚未生成”可消除开销。模拟仍占约一半样本，快照优化不能单独宣称解决模拟过载。

观测warm120原始binary共150796935bytes，平均1256641bytes/帧；不等于实际LAN带宽（未包含网络压缩/增量/调度），也没有输入P95/FPS数据。参考/观察的cold、warm bytes及完整wire哈希一致。

## 一致性与收尾

- 20步完整authority+隐藏状态：63927a01c410f1e947ca299fac8c0f832bd1be5db38bed6d0c2691b1f4fcf32b
- 270步完整authority+隐藏状态：f3be7af437a117ceb1b5426f25604d2fdfa09a047b7f0825d83d6f3d73bbe6e3
- 末态接收图：2883700cd52283a29615c6db5626bf50e5bc066fbf62dfe6e793ae14c5c3d87a
- 270帧二进制累积：6137d91f6d111c511c030364c8b06ce18e24b87944f7bc26d355ce174b4b4251
- 参考/观察所有上述值一致。无错误重试、无战斗warm-start删帧或实体减少。
- 源码漂移 4 个，资产漂移 0 个，保护输入漂移 0 个；具体列表在 final-state.json。
- 本轮没有生产改动，因此不重复全项目typecheck/lint，也没有生成发布包。上轮dirty-fire候选保持撤回；现有实验开关状态不变。总目标保持未完成。

工件：artifacts/lan-display-capture-cost-20260928，包括manifest/run-manifest、reference-result、observed-result、verdict、capture-cost.cpuprofile、cpu-analysis、cpu-mapped-nodes、全部冻结源/依赖和脚本。后续任何候选仍需未知回调/别名/持有帧/协议合同及唯一完整ABBA，通过后才真实浏览器验收。
