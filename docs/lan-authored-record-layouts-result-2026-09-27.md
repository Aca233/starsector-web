# 混编记录布局模板：局部改善，整体门槛失败并撤回（2026-09-27）

## 裁决
不保留本轮生产/测试改动。两组完整五段节省3.1234% / 0.9637%，未达事前各5%；decode+apply节省7.8718% / 11.4298%，第一组未达10%；权威三段节省1.0132% / -3.9187%，第二组慢3.9187%也超过3%允许回退。因此passesPrescribedGate=false；不重跑择优，不放宽门槛，不运行浏览器。不能用7.87%/11.43%的接收局部收益宣称模拟加速或实际输入P95改善。

## 实现过的内容
根据新鲜三舰全链路采样和6个代表快照，旧36个模板未覆盖23个当前布局，88.526%的被计数字段走通用循环。候选将该23种有序形状加入原构建期生成器，总59种、原64上限不变；字段guard、旧值读取、depth、写入、异常与未知布局回退原样。无eval或跳过校验、无元数据/画质/精度/频率/实体删减；未启用display-v2或额外Worker。

同时让已有compiled-vs-generic合同的参考端显式清空本次layouts.records，避免缺省control导入指向同一实现而形成无效对照。这项测试修改及下述定向runner都已随候选完整归档并恢复before，并非当前代码仍有该模式。

## 验证事实
- 一次生产typecheck、改动lint、generator --check通过。新增定向runner仅单独lint通过，没有再次全套静态测试。
- 完整旧check-native-capture启动失败：PulseDrive导入NativeSystemFactory在测试注册前抛Native system removed: orion_device。该文件及机制在A/B基底相同，不归因于候选；没有恢复已删除的原版实现。**旧套件未通过，不能声称全项目回归绿色。**
- 因该具体fixture错误，给同一runner临时加NATIVE_CAPTURE_RECORD_ONLY，只抽取原有完整有限布局合同与真实codec依赖，不复制/简化合同或stub原版机制。59种布局×3个depth×2个guard状态=354组compiled/generic差分，值GET、descriptor、旧值GET、写回/异常顺序以及嵌套向量一致；未知/多一字段/换末字段保持generic。目标合同一次通过。
- 独立A/B真实host初始化，2玩家+20AI三舰循环，176实体734挂点。60完整步，每步走capture→实际二进制encode/decode→真实LanDisplayWorld应用；tick8技能/flux、tick20靠近、tick30排散、tick38低血模块扰动。逐步authority+隐藏火控/RNG hash、完整wire字节hash、完整接收对象图digest相同。23新增布局在A不命中、B确实返回专用函数。
- 接收图digest保留所有自有属性标志、原型类名、Map/Set、TypedArray、别名/循环、undefined/NaN/±Infinity/-0；不是只抽查位置/HP。

## 唯一无profiler完整路径ABBA
740模块同源冻结，两臂四既有模拟实验都开。独立隐藏Node进程A0/B1/B2/A3；每臂150完整路径热身+120计时步，固定1/60，seed917、3200DP。列均为每步ms；阶段测量不包含摘要和hash、不含网络/IPC/renderer/真实定时器。不是浏览器FPS或联机Hz。

|臂|simulation|capture|encode|decode|apply|完整五段|
|---|---:|---:|---:|---:|---:|---:|
|A0|42.370|13.911|9.900|5.022|24.390|95.593|
|B1|42.511|13.697|9.303|4.733|22.364|92.607|
|B2|42.663|14.522|9.550|4.881|21.652|93.268|
|A3|41.286|13.213|9.719|5.087|24.871|94.175|

所有四臂20步hash bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224，270步hash bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6；末171活跃实体。每臂120包150047695bytes、wire SHA ae4688721b879181c07a0e51e004da86a8e73f7e571c4c095a76263eb50e22aa，末态接收图SHA 30bac6fb7f2db9d4cb77a5df583918ecd95b0f0cf1bafd9a84f47d8efa327c82。完整结果和120逐步原始阶段样本全部保留，没有只保留较快的一段。

上述权威端代码未被修改，墙钟反向波动不能直接归为具体因果；门槛依旧照实失败，不用未改模拟阶段更快替代接收目标。

## 撤回与后续
全部4文件在恢复前核对绝对路径、当前candidate SHA和before SHA，归档后恢复：
- scripts/lib/display-restore-shapes.json
- src/network/DisplayRecordRestore.generated.ts
- scripts/check-native-capture.mts
- scripts/check-native-capture.mjs

740生产模块逐文件等于本轮baseline；没有同期源漂移，其它已有改动均保留。工件revert-preflight.json/revert-verification.json和rejected-source记录完整撤回。所有本轮进程结束，没有浏览器/服务遗留，没有Git暂存/提交/推送/打包/发布。

下一步不围绕模板微调反复测速。新采样确认接收应用在当前完整CPU路径占约24.38%，应优先评估能减少重复完整定义处理的数据格式/生产者接收者协作，而非继续仅改变循环写法。已有display-v2及捕获改进仍需在当前混编基底核对整体权威和接收预算，不能把旧64舰局部结果直接当默认晋升证据。

工件根：artifacts/lan-authored-record-layouts-20260927。另见lan-authored-pipeline-cost-result-2026-09-27.md（单次热点采样，不能当本候选A/B数据）。
