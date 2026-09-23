# Phase 12：运动显示精度投影，及更诚实的陈旧度测量

日期：2026-09-21。继续多人 LAN/n2n/Steam 优化目标；本轮**没有完成整体目标**。不改生涯、不提交/推送/打包/发布、不改系统/n2n/防火墙，不启动可见窗口或子代理。

## 保留的底层改动

在共享 authority `captureMotion` 入口加入明确的 **DISPLAY-only 精度投影**，而不是降低物理 Hz 或延长保护期限。SWM1 与 MotionWire 仍精确保留它们收到的字节；精度投影发生在编码之前，不再把“原始 JS double 全位精度”当作运动显示的必需带宽。

- `MotionDisplay.mjs/.d.mts`：位置/速度选择 float32 仅限绝对误差 <= **1/1024** 世界单位（速度为单位/秒）；角度/角速度仅限 <= **2^-22** 弧度（角速度为弧度/秒）。任何超限值保留原 double，不能钳位或丢弃实体。
- Tick、time、输入 ACK、ID/order、teleport epoch、死亡/撤退位，以及原有 -0 保持精确。
- 主机物理、碰撞、伤害、武器、完整 CombatSnapshot 和存档精度不变。客机独立运动本来只写 WeakMap render pose；本地输入重放的脱离实体参考可用该显示端点，不能改变服务端权威。
- 不改运动/应用回执、带宽窗口、断流保护、插值或 dead-reckoning 时限。原分层/关键战斗/武器开关仍默认关闭；Steam 旧链路未新增 helper lane。

原版/当前实现证据见 `network-motion-display-source-notes-2026-09-21.md`。本机 0.98a CombatEntityAPI 对外是 Vector2f / float，但这**不能证明私有原版积分器或原版像素输出相同**。原版桌面实机对照仍待许可。

### 精度验证的边界

误差预算是每次端点的线性/角度误差。常规同分支插值和现有 .1s 外推可导出误差界；并不承诺所有离散渲染分支（例如恰好落在距离 snap 阈值、角差恰好为 π）都与原 double 路径选择同分支。未修改原插值启发式，也不把几何近似说成 bit-identical rasterization。当前真实录制在全部实测端点/插值/外推中满足预算。

## 已测证据（不是 Steam/n2n 实机效果）

### 字节成本

同一 22 舰录制，连续 1200 帧走**同一个既有 MotionWire**：
- 原 double：wire P50/P95 **908/952B**，合计 **1079721B**。
- 新有界投影：**582/609B**，合计 **692384B**（约 **-35.87%**）。
- 145593 个数值转换；542 个数值保留原 double；实际最大线性/角度误差 **0.000122005 / 2.384124e-7**。不是所有角度强行转 float32。

### 真实 headless Chromium

`browser-report.json`：241 份录制整世界还原，同时比较浏览器实际 `captureMotion`、Node 编码投影、精确 wire roundtrip 和两个真实 MotionReplica。
- 241/241 浏览器抓取与 Node 投影一致；**31410** 个有效显示姿态比较。
- 取 0/8/17/50/100/249/251ms 观察点，最大位置差 **0.000135693** 世界单位，角度差 **2.409305e-7** 弧度。
- 按 WebGLShipPass 使用的真实 hull sprite 尺寸/pivot/corner 计算几何点，zoom1.5 最大偏差 **0.000222299 像素**，zoom.3 为 **0.000044460 像素**。
- 显式 teleport snap、250ms 后清除旧 pose、reset 清理、原物理对象字段不变均通过，0 page errors。
- 这不是 GPU 像素截图对比、完整本地输入预测实测或真实网络/Steam/n2n/FPS 证明。

### 初轮五人弱网对照（最终矩阵见下方）

两侧均启用同样的武器/视觉/分块/运动 wire，只有运动投影不同；共享4Mbps、RTT60ms、20秒、去除前3秒，真实loopback TCP/WS与独立Node客机，无丢包，不运行游戏。
- 运动更新约 **38.82–39.18 → 43.59–49.00Hz**；运动到达 age P95 **93–94 → 81–83ms**。
- 武器仍约20Hz，到达 age P95约 **105–110 → 92–96ms**。
- 但完整世界仍慢：最差到达 age P95 **3169 → 3199ms**，不能宣称整世界改善。
- 新增加的**连续观测陈旧度**揭示更大问题：整世界最差 P95 **6130 → 5697ms**。只统计收到包时的 age 会隐藏两包间长时间没更新。

## 改进测量，而不是改低标准

`sampleStateAge` 每20ms采样“最新成功解码的 authority tick”年龄，包括两次到达之间的等待。重复/旧 tick 不能刷新 freshness；初始还没收到状态的样本单独计 missingSamples，不能伪装为0ms。回放报告同时保存 arrival age 与 observed age，并有缺状态、重复和乱序测试。

这些仍是 decode 端观测，不含真实浏览器 apply/render、主机抓取/物理成本或 input-to-photon。完整世界陈旧保护保持原样，回放没有运行游戏的 resync 状态机，不能由“errors=0”推断实际游戏不会断流。

## 撤回的共享信用池试验

尝试将 combat 与 visual 两个原各32KiB的窗口合成32KiB，并在启用combat时为其保留一个最大16KiB包的空间（motion和bulk仍独立）。这与Phase7共享visual+bulk不同，但仍失败：
- 首版遗漏 HP-only 降级之后的最终共同准入检查。`shared-five.json` 已标 `valid:false`，不能作为有界窗口证据。
- 修复准入检查并单独验证完全拒绝时不发送/不新增债务后重测：`shared-five-corrected.json`。
- 运动约50–51Hz，但 visual只有 **3.88–5.65Hz**，连续观测年龄 P95 **726–1840ms**，武器产生38次HP-only降级；整世界连续观测 P95仍 **5398ms**。
- visual变陈旧会使完整世界失去安全省略 projectile 的消费信用，因此“只让运动快”并不等于整体改善。
- **已撤回所有生产 admission hooks 和新 admission 模块**，原 CriticalCombat 与Phase11保留源码散列完全一致。试验源码仅留在 phase12/rejected-* 工件；回放显式拒绝 `--shared-realtime`，不允许旧命令悄悄测另一套路径。

下一步调度必须理解 visual baseline/更新的完成性与新鲜度依赖，不能靠固定切半窗口挤压弹体，也不能仅缩 bulk 来回应所有通道造成的排队。精度投影是降低真实字节成本的一步，不是完整架构覆盖已完成。

## 最终配对矩阵（保留代码，不含共享池试验）

`exact-matrix.json` / `display-matrix.json`；3/4/5 人含主机，每条件20秒、前3秒warmup，两侧都开启同样的武器/visual/motion/chunk路径。各客机独立Node进程，真实loopback WS/TCP共享FIFO，无丢包。原版引擎、GPU与真实Steam/n2n不参与。两组依次运行，本任务未同时启动其它性能测试；未控制用户其它后台负载，因此不提供置信区间或微小差异的因果断言。

| 条件 | 原 double 运动 Hz | 有界显示运动 Hz | 最差完整世界到达 age P95：原→新 | 最差完整世界连续观测 age P95：原→新 |
|---|---:|---:|---:|---:|
| 3人 / 4Mbps / RTT60ms | 52.53–52.82 | 52.71–52.76 | 806→551ms | 1378→913ms |
| 4人 / 4Mbps / RTT60ms | 50.82–51.00 | 51.82–52.71 | 2175→1977ms | 3446→3385ms |
| 5人 / 4Mbps / RTT60ms | 38.94–39.65 | 42.65–49.65 | 3495→2936ms | 6155→5626ms |
| 3人 / 32Mbps / RTT20ms | 59.77–59.82 | 59.59–59.65 | 106→106ms | 314→313ms |
| 4人 / 32Mbps / RTT20ms | 59.29–59.47 | 59.35–59.53 | 115→134ms | 338→335ms |
| 5人 / 32Mbps / RTT20ms | 58.35–58.47 | 58.53–58.76 | 164→153ms | 388→399ms |

- 五人弱网的运动连续观测 age P95：**119–124→100–107ms**；visual约 **9.82–10.65→10.88–11.53Hz**，不像共享池试验那样把弹体压到4–6Hz。
- 五人弱网在warmup之后还没有第一份完整世界的采样：原各peer21–26个（420–520ms），新0–14个（0–280ms）。这些缺状态样本单独统计，未填0ms进入分位数。该回放预先协商通道，不代表真实游戏bootstrap时间。
- 快网并非每项都改善：三人运动频率小幅下降；四人完整世界到达 age、五人完整世界连续 age有小幅变差。不能挑好数字宣称全条件无回退。
- Sender CPU 20秒内（原→新）：弱网3/4/5人 **7314→6921 / 6891→6422 / 7203→8938ms**；快网 **5297→6516 / 7577→6905 / 9391→8469ms**。吞吐/编解码工作量也变了，不能将差值全部归因于 `Math.fround` 或宣称CPU普遍下降。
- 12 个条件均无脚本记录的 hash/解码/传输错误。**4、5人弱网的世界仍明显过旧，新独立通道不能转成生产默认，也不能认定用户实际掉线已解决。**

## 最终检查

- `npm run network:check`：**379/379 + 5/5**。新增精度/边界/不变性/精确wire和连续age测试纳入既有门禁；真实motion authority检查改为明确精度预算，同时保留原物理对象完全不变、ACK/epoch/异常/整帧回退检查，没有放宽传输或陈旧保护。
- `npm run network:check:shared`：**20/20、6/6、81/81**；原完整快照/native capture等精确性检查保留并通过。
- `npm run steam:check`：**337/337**；仅是既有Steam回归门禁，不能冒充新分层通道已适配Steam。
- `npx tsc -b --pretty false` 和 focused oxlint：通过。
- 真实 Node authority Worker-only 重建检查无campaign输入；12秒、22舰、全世界消费延后200ms：**717/717 motion frames 已是幂等的显示投影**、240/240 combat frames含武器、42240 weapon rows；稳态 physics **59.879Hz**，0 errors/recoveries。主机物理不是因为网络显示精度而降到客机update Hz。它不含真实网络、GPU或浏览器渲染。
- 初版新单测把SWM1 ACK字典的既有null prototype与普通对象做严格原型比较，出现2个fixture失败；修正测试为明确检查null prototype并比较内容后10/10通过，未改字典原型或协议来让测试通过。失败日志保留。
- 新协议并非“无损原double”：只有SWM1/其wire的字节还原仍无损，DISPLAY投影有上述误差预算与原double回退；所有报告均按此区分。
- 本轮所有exec/test handles均已结束，没有留下本轮浏览器/游戏/测试服务。未进行staging、commit、push、tag或发布，生涯改动未触碰。

## 后续重点

必须继续减少整世界残余重复数据，并针对真实依赖调度 visual baseline/更新、核心战斗和bulk完成性；固定砍半窗口的试验已经证伪。还需实现其余战斗组件覆盖与Steam接入，最后做实际多机Steam/n2n、客户端apply/render、输入到画面验收。**目标保持进行中。**
