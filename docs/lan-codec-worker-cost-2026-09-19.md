# 快照编码子Worker：真实克隆成本与拒绝启用

## 决策

不将本轮codec子Worker实验接入生产。它不是AI Worker，也没有改变物理，但把完整快照对象跨线程发送时的结构化克隆成本高于现有单线程二进制编码。本轮没有改动0.2.3测试包。

## 实测方法

实际headless Edge中由父Worker创建子Worker；用三份真实32舰抓帧，每种路径40次预热+100次记录。父Worker同步编码、只克隆至子Worker、子Worker编码回传独立buffer进行比较。包含发送端postMessage同步耗时与完整往返。所有自建Worker/browser/随机端口HTTP在finally清理。非运行中物理、GPU或网络性能结果，不能外推为整场变慢百分比。

|帧|字节|同步二进制编码均值|子Worker发送端克隆均值|子Worker编码往返均值|
|---|---:|---:|---:|---:|
|0|294025|1.45ms|1.84ms|6.34ms|
|1|328418|1.72ms|2.13ms|7.28ms|
|2|519476|2.45ms|3.62ms|12.28ms|

即使不算子线程执行和返回，发送端负担也增加，故不能把“多一个核在忙”当作成功优化。JSON路径发送端工作略减少，但完整往返约9.27/10.50/16.37ms，同步约2.97/3.64/5.89ms；没有实战收益证据，不因能跑通而上线。

## 后续路径

继续用实际32舰Worker的CPU采样检查捕获/模拟分配成本，而不是扩大快照credits或放宽过载规则来容忍新增排队。60Hz目标、1/60 dt、AI owners关闭、既有过载/断线规则保持。

证据：artifacts/lan-encode-worker-20260919/clone-cost.json、clone-cost.mjs、bench-parent.js、bench-codec.js。独立的有界桥接模块仅保留artifact实验，未由生产模块引用。

## 当前32舰真实Worker采样与捕获候选

5秒预热+12秒CPU采样，当前源码生成可读函数名的实际authority Worker；无展示/联网，不能作为完整对局Hz成绩。采样总时长约12.12秒，fixedUpdate约5.35秒、captureCombat约2.50秒、编码约2.00秒，后三者并非互斥栈的任意加总：这里capture和编码是snapshot下的不同子分支。保持AI owners关闭。

补充对象计数：战斗第660 tick约9,884次对象pack，其中1,717次命中仅21个不可变元数据对象，主要是小颜色数组和导弹引擎外观。尝试单帧只读缓存后，配对捕获均值2.519→2.693ms，反而更慢；普通数组标量内联也没有证实收益（2.367→2.402ms）。两项均只保留artifacts，不改生产capture，不凭字节一致就把性能实验标为成功。

下一项实际候选移到主窗口解码任务调度：原先连续setTimeout(0)可能触发浏览器4ms嵌套钳制，新的单MessageChannel mailbox保持原队列/credit/末帧/重置规则，不增AI或编码Worker，不使用微任务抢占输入。完整32舰对照另行记录。

## 0.2.5 后续：数组标量编码与定时器假设

先核对发布链：既有 32 舰成功记录中，约 20 秒 authority 发布 938 帧、客机实收 933 帧，物理约 60Hz，网络消费窗口并非主要拒绝点。详细归因见 receiver-credit 文档与 publication-attribution.json。

仅在 ignored artifacts 中尝试 ProjectedSnapshotEncoder.encodeArray 内联标量分派。B1 使用 indexed loop：Node 配对几何均值约快 2.32%，未达预先 3% 门槛；真实 Edge Worker 编码约快 18.66%。但 B1 的自定义 Symbol.iterator 语义与原库不同，不应把此问题划为合约之外；capture 对自定义 map/Species 有通用路径，不能仅凭正常帧字节一致接受。B1 原始数据保留，没有上线。

B2 只把循环修正为原库相同的 for-of，保持数字写入、深度、预算、fallback 与其他方法不变。Node 和 Edge Worker 各 116 项行为检查通过（包含新增 42 项迭代器/IteratorClose/Species 检查），每运行时 3480 次输出字节与缓冲区独占检查、6 次真实 Worker transfer 通过；但配对编码分别**慢 19.27% / 21.55%**，均 0/72 配对胜出。没有重采样、删除异常值、改门槛或新增第三变体。无效迭代器的原生 TypeError 变量名文本不同已记录，不声称错误文本一致。

因此两项均拒绝集成，不执行已准备的完整应用 ABBA，不改现有生产 codec/0.2.5 包。记录位于 artifacts/lan-array-encode-20260919/（RESULTS.md、b2-RESULTS.md、原始 JSON/CSV）；artifacts/lan-array-live-20260919/decision.json 明确区别“准备好脚本”和“实际完成实战验收”。没有新建项目 tests/runner。

另用真实 Edge Worker、9.5ms 合成模拟 + 6.8ms 合成捕获编码、4 秒 ABBA 检查“setInterval(4) 在每步之后另加 4ms 空等”假设。原计时器实际空等均值约 **0.364ms**，两轮都约 **59.7Hz**；deadline/MessageChannel 也约 59.7Hz。该结果不支持无条件的 4ms 等待假设，故不据此替换生产调度。它只是已知合成工作下的浏览器计时机制检查，不是完整游戏或分配/GC 测量。最初诊断 import 路径错误发生在启动浏览器前，修正 file URL 后才完成一次 ABBA；没有重跑到性能通过。记录在 artifacts/lan-deadline-scheduler-20260919/。

上述自有浏览器、Workers、随机端口服务均已关闭。临时诊断 profile 留在 artifacts，不影响用户进程；3005 未重启，AI owners 未启用。

## 0.2.5 实际对局 CPU 采样与系统列表候选

用成品 release 资源、两个正常绘制的独立 headless Edge、相同 32 舰配置，采样房主 authority Worker 20 秒（1ms CPU profiler）。没有替换用户 3005/桌面，不开启 AI owners。该轮 94 个按键边沿均得到累计权威确认、物理约 60.05Hz，无恢复或断线，自有浏览器/relay 清理通过。采样轮实收约 31.99Hz、输入确认均值 64.08ms；**profiling 有开销，不能与此前未采样 46.62Hz 直接比较后声称代码回退或定量归因 profiler。**

对 20.117 秒/13312 个采样点按函数位置汇总，递归 inclusive 去重：fixedUpdate 约 13.724s；captureCombat 约 3.061s，其中 pack inclusive 3.003s/self 2.753s；encodeProjectedBinaryFrame 约 2.138s。这是采样归因，不是这些函数全都互斥可任意累加。另一个具体热点是 allSystems getter self 446ms，isPhased inclusive 1301ms（包含前者的一部分），原列表 getter 每次 slice+spread。

针对该 getter 只做一个减少临时数组的 artifact 候选，要求仍返回新列表并保留公开可变字段和 custom slice/Species/iterator 回退。结果拒绝：38/41 行为用例通过，3 个 Proxy 反例证明反射守卫新增操作/异常及 descriptor 与 get 值不同；逐调用守卫成本反而使 Worker 单次调用慢约 25–28 倍。未集成、不跑完整游戏候选、不追加变体，不用“保守兼容”包装性能失败。所有原始反例和时序保留，正式 Ship.ts 未改。

可复核原始记录：artifacts/lan-authority-profile-025-20260919/authority-0.cpuprofile、summary.json、analysis.json；完整绘制/输入检查在 artifacts/lan-worker-latency/profile-025-32.json。getter 唯一候选及清理在 artifacts/lan-system-view-20260919/；准备但没有执行的应用 A/B 在 artifacts/lan-system-view-live-20260919/decision.json。所有测试自有进程已关闭。

真实两机验证仍缺：当前默认桌面日志最后更新 2026-09-18T16:53:31Z，仅记录旧 0.2.1；没有新 0.2.5 双端 LAN 300ms/Steam 开战断线记录。不能把这个本机 CPU 采样或大厅通过当作那两个问题已解决；需要双方同包复现后的日志与当时联机统计定位实际链路。
