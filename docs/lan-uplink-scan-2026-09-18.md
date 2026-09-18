# 联机快照校验与上传顺序（2026-09-18）

## 范围

用户要求优先处理联机。本轮仅修改 BinarySnapshot.mjs 的兼容性扫描与 LanBattle.tsx 的房主快照处理顺序；保留此前的快照饥饿修复。未改变物理步长、AI/伤害规则、舰船数量、特效、恢复次数、快照播放/预测、协议版本与服务器校验。没有把这些改动当作百舰实时问题的完整解决方案。

## 正式改动

- 对数组和对象中的标量直接检查；嵌套复杂值仍递归。有限数字、最大深度、危险键和孤立 UTF-16 代理项的判定保留。
- 仅缓存已经验证安全、长度不超过 128 的短字符串；键最多 512 项、值最多 1024 项。超过容量的字符串仍完整校验，不按输入无限增长。没有缓存可变对象的验证结果。
- 房主收到 Worker 快照后，先调用既有 sendSnapshot，再解码自己的显示副本。隐藏页面仍上传、不做本地显示解码；单快照背压的消费确认仍放在 finally，限流与缓冲区所有权不变。

## 没有采用的实验

1. 把完整快照树 structured-clone 到独立编码 Worker：大帧端到端成本明显上升；百舰 tick600 从约 37.5 ms 编码，变为约 85.1 ms 往返，未采用。
2. msgpackr 2.1.0 浏览器标准 MessagePack：六个真实快照的完整编码仅改善约 5%～16%，仍需兼容性校验、非普通对象回退和独立 buffer 复制。未做完整异常输入认证，收益不足以承担新依赖与兼容面，未采用。临时依赖仅在忽略目录 artifacts/msgpackr-probe，正式 package.json / lock 未因此修改。

## 逻辑与局部成本验证

- 本轮 stdin 检查 14,216 项通过：随机嵌套数据、undefined、非有限数、大数、危险键、Unicode、深度边界、循环、非普通对象、缓存饱和、getter 读取顺序、transfer 后继续编码，输出与原编码逐字节一致。
- 同一检查含 32 种真实快照处理代码分支组合：隐藏/可见、连接状态、开战状态、二进制/JSON、解码失败。仍恰好确认一次消费；满足发送条件时上传在显示解码前。模拟耗时用于顺序验证，不是网络延迟提升的实测。
- 上轮兼容性扫描实验的 9,049 项与六帧字节等价结果保留。浏览器交替编码数据已排除前三轮预热：

| 舰数 / tick | 原完整编码 ms | 本轮扫描实现 ms |
| --- | ---: | ---: |
| 32 / 0 | 4.033 | 3.520 |
| 32 / 300 | 7.527 | 6.987 |
| 32 / 600 | 15.773 | 14.947 |
| 100 / 0 | 10.887 | 9.213 |
| 100 / 300 | 23.140 | 21.660 |
| 100 / 600 | 40.467 | 38.387 |

这只是完整编码阶段约 5%～15% 的局部收益，不是 FPS、整局实时倍率或端到端输入延迟的提升结论。

## 生产构建与双端实测

- typecheck、lint、隔离生产构建通过；构建仅有既有的大 chunk 警告。
- 构建：2026-09-18T03:25:39.023Z；目录 artifacts/lan-uplink-scan-preview；host.worker-4S7H3bLk.js。
- 固定种子 2232494901、两真人守护者，余舰为两队等分锤头；全部按场景规模初始部署。AI 编成通过既有 options 协议设置，不声称完整编队编辑 UI 验收。
- 首次新版 32 舰在服务器 tick761 后因第三次真实过载停止；100 舰在 tick55 后停止。均无 pageerror，Worker 给出真实计算过载错误。百舰末段单步均值约 37 ms，已经超过 60Hz 的 16.67 ms 预算。
- 后续同机顺序对照：旧版 32 舰约 25 秒仍 running，但已恢复两次，窗口倍率 0.97793；新版 32 舰在 tick1255 后第三次过载停止，窗口倍率 0.96509。这个结果不能宣布新版 32 舰性能通过，也不能仅凭两次顺序运行把差异归因于某一改动。
- 运行期间观察到其他两个已有 Vite 进程持续占用 CPU（约 2 秒区间分别消耗 5.3 / 5.7 CPU 秒）；没有停止它们，也没有因此排除失败记录。并发负载是未控制因素，不是已证明的唯一原因。
- 新版 8 舰首轮约 25 秒：1.00099×、无 Worker recovery/error；客机 W 按下/释放有权威 throttle 与 ack 确认。随后脚本在刷新短暂 sync=null 时自身读取 sync.id 抛错，未将其当游戏故障或重连通过；保留原记录并另行使用可空判断复测。

最终重连复测结果见下节。

## 最终重连复测（8 舰）

生产双端、固定种子、同一构建。约 15 秒不含解码探针的采样窗口为 1.00218×；之后执行操控与重连核对：

| 阶段 | W 按下确认 tick | 释放确认 tick |
| --- | ---: | ---: |
| initial | 919 | 928 |
| after-refresh | 1063 | 1075 |
| after-socket-reconnect | 1158 | 1170 |

三个阶段均观测到客机输入 keys=1、权威 throttle=1，释放后 throttle=0 且 ack 推进。刷新与主动关闭客机 WebSocket 后都获得新的 syncId，恢复 controls-ready 后再操控；最后服务器 running、tick 1170、双方 loaded/connected。0 Worker recovery/error、0 pageerror。

这是本机 8 舰刷新/连接中断恢复的短时通过，不是实际跨机高延迟、丢包、Steam 或长时稳定性认证。8 舰只是独立功能验收场景，没有降低产品默认规模或把百舰失败改记为成功。

## 证据

- artifacts/lan-binary-scan-source.json、lan-binary-scan-probe.json
- artifacts/lan-encode-offload-probe.json、lan-msgpackr-probe.json
- artifacts/lan-uplink-order-source.json、lan-uplink-scan-validation.json
- artifacts/lan-uplink-scan-frozen-sources.json、lan-uplink-scan-build-log.txt
- artifacts/lan-uplink-scan-live.json、lan-uplink-scan-comparison-live.json 及相应日志
- artifacts/lan-uplink-scan-reconnect-live.json 及相应日志

## 交付边界

- 未创建项目测试文件或测试运行器；验证代码经 stdin / 内存模块执行，数据与构建在忽略的 artifacts 目录。
- 未替换普通 dist、未触碰或重启用户的 3005 入口。
- 没有因本轮更换正式编码库，也没有开启不适用于自定义联机配装的窄场景多核 AI。
- 真实过载仍未解决，不能把快照饥饿修复或小场景重连成功扩大成大规模稳定性保证。
