# 三舰混编完整CPU路径定位（2026-09-27）

一次新采样，不是性能对照；无生产修改。旧模拟调用树中WeaponThreatEnvelope.get内exact资格子树仅占模拟采样2.3517%，因此没有继续实现资格缓存候选。改为当前740模块、真实host.init(binarySnapshots=true)、四既有模拟实验共同开启的2玩家+20AI三舰混编，初始176实体734挂点，seed917、3200DP；150完整五段热身+120五段采样。每步实际captureLanDisplayCombat→encodeProjectedBinaryFrame→decodeBinaryFrame→create/applyLanDisplayWorld，无renderer/IPC/network/真实调度。

|互斥调用栈归属|采样占比|
|---|---:|
|阶段外（含GC/工具）|6.508%|
|模拟|40.808%|
|捕获|13.963%|
|编码|9.615%|
|二进制解码|4.727%|
|接收应用|24.379%|

实际12845样本，平均间隔1075.1us，不能将请求500us当作实际间隔。GC self4.641%，无法按栈准确归属到触发它的阶段。inclusive相互包含不可相加；表是采样分布不是CPU占用率/吞吐/优化收益。profiler下五段均值分别49.851/16.483/11.818/5.720/29.238ms，不能据此宣称浏览器Hz、FPS或输入P95。

接收应用self热点：unpackDisplay约25.92%、unpackRecord约17.29%、assertDataField约17.27%、定义visit约16.70%（分母为apply stage）。未重新实施此前失败的validator标量拆分/guard查找重排/encoder标量直写。

随后仅一次非计时六快照布局计数，tick0/20/60/150/210/270。实际37布局，其中23不在现有36模板中；568418/642091字段（88.526%）使用通用循环。这是六快照处理次数，不是稳态字段量或CPU比例。slotId32字段、name31字段、voidShield18字段及自定义武器形状已与旧模板不同，旧64原生舰全部命中的证据不再覆盖当前场景。

下一具体候选：补齐这23个有限布局（总59，保留原64上限），复用原构建期generator，仍逐字段depth/descriptor/读旧值/写回、未知布局回退。不是跳过校验或启用display-v2。实现前准则另见lan-authored-record-layouts-source-notes。

真实三舰20/270步authority+隐藏tracker/RNG均与既有hash相同；120包共150047695bytes，wire SHA ae4688721b879181c07a0e51e004da86a8e73f7e571c4c095a76263eb50e22aa。完整旧版生产接收器实际应用每包成功；计数运行终态也同hash。初始一次构建因未捕获desktop/package依赖失败（未执行profile），修复为保存所有外部依赖文本/hash后只跑了这一次采样；首次计数插桩因esbuild变量重命名失败（未执行战斗），核对产物后定向修复。没有重复采样择优。归因脚本v1把Node内部帧误套bundle行号，v2仅对真实bundle URL映射模块；原profile未重跑，v1归档。

工件根：artifacts/lan-authored-pipeline-cost-20260927。源码/依赖、bundle/map、loop.cpuprofile、cost-attribution.json、stage-samples.json、record-shapes.json及全部脚本保留；本采样与计数进程均已结束。
