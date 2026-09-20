# Steam 本机房主二进制直通：phase9（2026-09-20）

## 目标与边界

继续削减真实客机接收60Hz路径的重复转换，不把渲染插值算成接收，不改变物理频率、状态精度、超时或拥塞阈值。没有提交、推送、安装、打包或发布；未改生涯模式。当前正式版本仍是0.2.5，工作区修改不会自动更新已安装游戏。

## 证据 → 改动

`artifacts/network-latency-phase9-20260920/baseline.cpuprofile` 和 `cpu-baseline.log` 对发布版22舰录制进行生产codec采样：

- Steam发送准备中，JSON解析/重新序列化、哈希和重新二进制编码占主要CPU；目标准备平均6.90ms、差分压缩3.24ms，还原校验7.34ms（这三项不是同一个进程的真实在线帧时间）。
- 原本本机relay已经验证过状态，Steam发送器却再次JSON.parse、重新生成SWB1。房主Worker原本在Steam模式也必须先生成完整JSON。
- 本次令房主Worker复用LAN已存在的二进制发布能力，经本机relay验证后，直接交给Steam差分发送器。canonical JSON仍生成一次用于SHA256及旧端fallback，不删除校验。

### 协商与信任边界

- 新增的是**本机前端** `binarySnapshots:1` hello/welcome能力，不是远端协议升级。只有当前大厅owner的本机WS由gateway注入 `binaryHost:true` 身份，且前端主动提出能力，relay才确认。
- 远端guest没有该身份，伪造hello不启用它；未完成hello、非房主、未协商Steam本机连接依旧不能上传binary。原局域网行为不变。
- `LanConnection.canSendBinarySnapshots` 控制Worker初始化和实际发送；旧helper未确认时仍发布JSON。断线新建连接重置协商状态。
- relay仍先执行原二进制decode、房主/对局/序号/帧校验，再共享只在本机代码中创建的 `{state,bytes}` 给SteamPeer；没有给网络消息开放“已验证”标记。
- negotiated远端直接复用完整SWB1，保留SSB1 canonical-size/SHA256、SLD1 CRC、motion reference v1、native全部分片成功后才能commit，以及独立network/renderer ACK。
- 旧remote、过小/超大/不适合二进制的状态回退原JSON/tree路径；guest收到的仍是完整text JSON。本阶段未改guest本机bridge，也未声称端到端完全二进制。
- 单广播仍共享编码和压缩缓存；不引入无界历史、重试或陈旧状态队列。共享及每peer窗口与phase8相同。

## CPU/字节 ABBA

证据：`host-cpu-abba.json/log`、`probe-host-cpu.mjs`。发布版v0.2.5 `ef043ecef4547321929dd0ffb0eee47074d08b13` 的22舰录制，每轮241帧；包括capture编码、relay解码和gateway打包，所有接收canonical JSON精确相等。统计包含GC/调度噪声。

|阶段均值|原JSON本机链路|新binary本机链路|
|---|---|---|
|capture编码|2.45 / 2.90ms|1.63 / 1.91ms|
|relay解码|1.80 / 2.04ms|1.24 / 1.35ms|
|gateway准备/分片|10.36 / 11.58ms|7.13 / 6.82ms|
|以上总计|14.61 / 16.52ms|10.00 / 10.08ms|
|平均应用线包|21,934B / 21,934B|21,934B / 21,934B|

没有用精度/字段删减换速度。这里只是CPU/字节对照，不是实际游戏端到端延迟。

## 双进程实际字节整形 ABBA

证据：`host-link-abba.json/log`、`probe-host-link.mjs`。两端生产SteamPeer/codec，经实际WS/TCP shim，60Hz offered，每轮12秒、头2秒不计；两变体都启用phase8字节窗口。此探针**将capture编码和relay解码也放在sender进程中计时**，相比phase8多了工作，不能把phase8的44–46Hz和本表直接拼成连续增益。

|下行|原JSON本机链路接收Hz|新binary本机链路接收Hz|原状态年龄P95|新状态年龄P95|
|---|---|---|---|---|
|4Mbps|17.7 / 17.8|18.3 / 18.1|201 / 219ms|210 / 215ms|
|32Mbps|38.3 / 33.8|47.8 / 44.7|89 / 89ms|80 / 80ms|

所有交付canonical JSON相等，errors=[]。不是原生Steam SDK/Valve路由、n2n实网或完整渲染战斗；renderer消费在shim中即时完成。低带宽没有明显延迟改善，phase8相对固定64KiB的低带宽年龄回归仍未消除。当前约22KB线包如果每秒60帧，仅应用负载已约10.5Mbps，4Mbps不能通过把频率常量设为60解决。

## 回归

- typecheck通过、最终lint仅既有其他任务生涯脚本警告；没有修改那些脚本。
- 网络gate **175/175**，新增客户端协商/未确认拒绝测试。
- Steam全量 **287/290**。6个本机binary集成测试全通过：本机身份协商、旧guest、原JSON回退、非房主/坏帧/旧序号/错对局、共享原始binary、SHA校验、超大fallback、原生发送失败不提交基线。
- 仍失败的是相同三项：legacy9人8Mbps→256Kbps骤降，实验Sockets120秒骤降+3秒停顿恢复，实验Sockets9人健康吞吐。没有放宽>=40Hz/人、总>420或8秒超时。
- 最终输出：`typecheck.log`、`lint-final.log`、`network-suite.log`、`steam-suite.log`。Steam退出码1是上述未完成项，不能当作全绿。

## 未完成

客机稳定实际60Hz、native Steam/n2n双方桌面复测、低带宽排队年龄以及三个压力门槛仍待解决。下一处主要成本仍是guest完整JSON输出/再解析、同步gateway准备期间阻塞ACK/poll、字节拒绝前的无用准备；需要分别验证，不能靠扩大可靠队列掩盖。目标仍active，不符合正式发布就绪条件。

## 无头浏览器真实本机传输补验

`check-browser-host.mjs` / `browser-result.json` / `browser-host-final.log`：Edge 153.0.4234.46，使用生产LanConnection、实际loopback WebSocket、生产relay/gateway/codec与SDK替身。

- 非隔离页面：原生WebSocket回退；协商binary后3个不同序号的状态精确交付。
- 隔离页面：实际WorkerLanSocket / DedicatedWorker / SharedArrayBuffer队列；同样3次精确交付。
- 无pageerror；没有启动可见窗口或注入桌面键鼠。这是连接/数据完整性验证，不是游戏渲染、实际Steam路由或60Hz吞吐证明。
- 探针等待实际room running消息，并按原生产发送gate等待可写；没有修改生产gate来迎合测试。初版探针错误等待不存在的run事件，以及过快调用导致正常skipped，均修正于探针自身。
- `source-manifest.json` 记录后台入口依赖图及涉及前端/测试的hash；write:false，不生成可发布包、无campaign输入。
