# 联机运行链路优化（2026-09-18）

## 目标

解决真正的计算/同步成本，不以显示FPS、插帧、减少舰船、降低AI频率或放松过载保护宣称修复。用户允许底层改动与子代理。工作区另有并行功能开发，本轮只集成可隔离测量的补丁，不回滚其它代码。

## 当前采用范围

- BinarySnapshot：保持SWB1/MessagePack与数字精度，增加有界短字符串编码缓存，完整安全预检后采用同步完整帧reader；异常UTF-8保持原库回退。详见 lan-binary-cpu-2026-09-18.md。无独立收益的自制数值writer已删除。
- CombatSnapshot：客户端同次同步还原内复用原生舰队名单，避免每艘舰还原/索敌重新构造整队。自定义索敌函数仍调用，名单不跨帧缓存。通用字段读取快路径因getter/Proxy顺序风险已撤回。
- Vector2：上轮norm兼容修正补验通过（原生、自定义hypot、模块加载前非函数、读取坐标时更换Math、覆盖回调.call），证据 lan-vector-norm-final-regression.json。

## 小舰队真实绘制诊断

冻结当前源，隔离headless Edge，不连接/干预用户现有房间；同一页真实authority Worker、binary解码、apply、SnapshotPlayback、LocalContrails/LocalMuzzleEffects和WebGLCombatRenderer，8舰，60秒。不是用户当前6个标签页的直接采样，也不包含relay/React UI/真人输入网络。

- 完成60.001秒、3599物理tick，按最后快照估算推进0.99971×；未触发恢复/错误。1201个快照（含初始帧）。
- parse均值0.979ms，apply均值1.076ms，render均值1.256ms；不将这些局部均值作为无卡顿保证。
- 存在两次77.4/100.1ms画面间隔（约12.57s/43.26s）。因此此诊断不构成“完全不卡”的结论。
- 证据：artifacts/lan-current-small-render.json、lan-current-display-sources.json。这份冻结含编解码早期候选，非最终补丁生产A/B。
- 首次诊断因局部变量遮蔽render函数而未绘图，已单独保留为lan-current-small-render-invalid-no-render.json，明确排除在绘制验收之外。修正后完整重跑上面的60秒。

## 检查与部署状态

当前浏览器库存工具仍返回连接错误，未能读取用户现有标签页，不能把重复页/后台节流猜测写成已确认根因。没有以它为由关闭用户页面。

生产构建同源A/B已完成；完整工程检查和3005版本更新见下节。

## 最终生产构建对照

冻结 artifacts/lan-final-round-sources.json，旧/新唯一差异为本轮 BinarySnapshot 与 CombatSnapshot；火控未采用候选，Vector2沿用已经验证的当前版本。用Vite生产编译（非开发TS直接执行），两份Worker的source map逐字确认使用各自codec源码。含真实Worker+二进制解码+apply+WebGL，本测试不含relay和React房间UI。顺序：8舰旧→新，32舰新→旧，100舰旧→新，重型8舰旧→新。每组各一次墙钟观测，不把跨场景平均时间直接作配对微基准。

轻/中/大场景为两真人guardian + 剩余hammerhead；重型8舰为两guardian + 三onslaught/三paragon。舰数相同不代表任意舰型/装配的负载相同。这不是用户当前对局的精确复现。

图形后端：ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)。

| 场景 | 旧时长 / 推进 | 新时长 / 推进 | 结果 |
|---|---|---|---|
| 8 | 30.00s / 0.9993× | 30.00s / 0.9994× | 均完成窗口 |
| 32 | 20.00s / 0.9973× | 20.00s / 0.9981× | 均完成窗口 |
| 100 | 7.76s / 0.8334× | 7.17s / 0.8132× | 均因持续过载失败 |
| 8-heavy | 30.00s / 0.9987× | 30.00s / 0.9994× | 均完成窗口 |

100舰新版本也没有达到实时，本次甚至比旧版早约0.59秒触发保护，不能用局部codec收益声称总体改善。失败附近新版本实际物理批次平均约25ms/步，单步已超过60Hz所需的16.67ms预算；网络/还原优化不能代替主机模拟CPU改造。

同一生产诊断观察到的32舰客户端解析均值：3.953→3.025ms（约23.5%下降），还原3.699→3.543ms；8舰解析1.307→1.113ms，还原1.531→1.544ms，没有宣称小规模还原稳定提速。更强的阶段采用证据在codec多轮配对与restore名单复用多轮配对报告，不把百分比相加。

证据：artifacts/lan-final-production-ab.json（包含全部逐帧/逐快照/独立Worker诊断）、lan-final-production-driver.txt，以及两个隔离production目录。所有临时浏览器与server在finally关闭，诊断进程exit0。

## 火控候选否决

两个新火控候选在完整回放一致的前提下，百舰总体步时仅约0.6%均值差异，尾部不一致改善；正式AutofireController保持本轮起始原文。详细见 lan-firecontrol-cpu-2026-09-18.md，不把实验候选部署。

## 最终工程与协议检查

- npm run typecheck、npm run lint通过。
- npm run ai:check通过现有84项检查，没有新增测试文件或runner。
- 正常完整Vite生产构建完成于 artifacts/lan-ready-preview，构建ID 2026-09-18T10:38:56.486Z，仅既有大chunk提示。
- 独立真实createLanServer + 两个WebSocket客户端通过：建房/加入/准备/开战、binary快照逐字段不变转发、fresh-frame同步门禁、访客输入转给房主、JSON兼容转发。证据 artifacts/lan-final-relay-smoke.json。首个诊断省略Origin被403正确拒绝；按服务要求提供同源Origin后完整流程通过。临时客户端/服务在finally关闭，进程exit0。
- 构建期间冻结src未漂移。

## 尚未更新3005

最终“停止已核对的旧游戏进程→复制构建→隐藏启动新后台”命令在执行前被工具策略拒绝；未通过其它执行途径绕过限制。读回确认3005仍为PID44460、build 2026-09-18T09:28:51.621Z；dist也仍是该旧构建。本轮代码和新构建已保存，但刷新旧网页不等于用上优化。需要停止旧后台并重新构建启动后才能在3005使用本轮版本。
