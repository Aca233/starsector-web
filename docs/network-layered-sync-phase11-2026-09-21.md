# Phase 11：独立武器状态与有界无损参考压缩

日期：2026-09-21。范围：实验性 LAN 分层链路及共享 Web authority 的可选武器抓取；不是正式版开关，不含 Steam helper 通道移植。不修改生涯源码、不提交/推送/打包/发布、不调整 n2n、网卡或防火墙。全程后台和无头测试。

## 状态：尚不能称为“彻底解决”

前十轮表明：只提高整世界发送 Hz 或加大在途窗口，会把 3–5 人的共享上行变成排队和陈旧数据。此次把武器状态从整世界恢复周期中拆出，但**增加小通道本身也会挤占带宽**。没有给客机伪造 Hz、没有放宽 1500ms 世界断流保护、没有减轻校验/回执要求。整体目标仍在进行中。

以下开关仍全部默认关闭：`VITE_LAN_LAYERED_SYNC`、`VITE_LAN_CRITICAL_COMBAT`、`VITE_LAN_WEAPON_STATE`。只有明确启用前两项的匹配构建才走关键战斗通道；第三项控制是否抓取武器扩展。默认游戏不会自动获得本报告的实验结果，旧 Steam 实时链路也未接入这些独立组件。

## 原版证据与实现边界

详细证据见 `network-weapon-component-source-notes-2026-09-21.md`：本机 0.98a WeaponAPI 中角度/充能/弹药/冷却/禁用分属独立属性；ShipSystemAPI 的系统生命周期另行处理。Web mount 当前已有 recoil/angle/glow 等字段和对应 renderer 读取路径，本轮只同步已有数据，未改变射击、伤害、随机数、特效生成或界面布局。

- 新 `WeaponPresentationState`：WPC2 固定布局 float64 行，按 shipId + slotId + specId 定位。保留 -0、可选永久禁用字段的“缺省/undefined/false/true”区别。
- 16 个数值字段：角度、冷却、弹药/充填、后坐/光晕/枪管/散布、生命/最大生命、禁用计时/时长、burst 余数/计时、射击阶段计时/周期号；另有 autofire/trigger/disabled 位和 IDLE/CHARGING/ACTIVE/CHARGEDOWN 阶段。
- **真实射击测试发现并修复哨兵遗漏**：无限弹药和持续光束 `firingStateTimer` 都可能为 +Infinity。之前只允许前者，PD 激光激活后武器组件被丢弃。仅这两个字段允许 +Infinity，其它字段及 NaN/-Infinity 仍严格拒绝；没有修改原射击代码。
- SCC1（核心 HP/flux 等）兼容；SCC2 增加完整武器名单。全组件仍最多 32768B。过大/不可表达的武器部分降级为 HP-only，不能压掉 HP 更新。
- replica 只写已有舰船/挂载；校验 spec，不创建挂载，不调用 fire/update/repair。自定义 accessor/read-only、重复 slot、未知目标跳过。读身份也不用 getter；新建可选自有属性用 defineProperty 避免触发继承 setter。
- 独立 weaponTick：更新的 HP-only 不清除最近武器帧；陈旧整世界 restore 后重新覆盖武器，同 tick/更新的整世界优先；渲染循环可缓存避免重复写数千个字段。

原版桌面实际 UI 对照未做；没有操作可见窗口。本轮浏览器测试是数据还原，不是 WebGL 像素/音效/输入到画面验证。

## 压缩不是客机模拟

保留原始权威 bytes/tick/CRC，所有参考只产生 XOR 的参考字节，绝不直接应用到世界：

1. 普通 ordered XOR：一份当前已获准写入的完整组件。
2. 时间参考：最多再保留一份浅层 previous，从两份已发送帧推算部分有限角度/计时数值；不预测 HP 或弹药，跳过非有限值及不合适的间隔。
3. 同舰角度参考：用每舰武器的角度差中位数形成有界校正列表，再 XOR 精确残差。列表最多 128 项、1153B，ship index 必须唯一递增；回绕、任意瞄准差异由残差完整表达，不要求预测正确。

SCL1 flag 4 表示时间参考，flag 8 表示同舰角度参考，都必须同时有 delta flag。较复杂方案只有实际压缩包再省 >32B 才采用；整包还可回退 full。每次发布最多共享两个 base 变体，不增加 per-flight payload 历史。房间仍 32KiB / peer 16KiB 在途，只有真实 browser consumption 回执释放相应债务。不能以超时/取消/新 scope 虚构 credit。

接收端限制解压量，校验 anchor 数量/长度/索引/有限值，重建后再次 CRC/schema/tick 校验。任何失败不改变当前或 previous base。修复了不显式 reset 而直接换 match/sync 时 sender 可能带入旧 scope previous 的问题。该实验格式需要匹配的新 helper/server 构建，未做旧 helper 的能力协商/部署承诺。

## 拒绝的设计和代价

- 初版 positive-zero elision 虽然原始字节少，行偏移变化破坏 XOR：真实射击测试 wire P50/P95 3618/4596B。保留固定布局后为 1859/2330B，原始值仍完全相同。
- 字节平面转置离线试验反而更大（带时间参考总量 373870B vs 358585B）；未接入产品代码。
- 录制的 240 份有前帧更新，时间参考压缩 payload 总量 358585B，加入同舰角度后离线 229387B；这是压缩比较，不是端到端延迟改善证明。
- 增加参考编解码 CPU 和最多两份原始 base 内存。22 舰原始组件 28804B，4 客机 raw bases 最大约 230432B，不含 target/cache/回退，按 stats 另外计量。

## 已有验证

- 真实 Web authority 22 舰、1500 physics ticks、500 完整武器组件、88000 行、4281 非 idle 行；**0 武器抓取回退**。普通 full 1 / delta 499 / 时间参考 493 / 同舰参考 439。
- 本轮样本 wire P50/P95 **1117/1424B**；capture P50/P95 **0.407/0.611ms**，replica apply **0.184/0.320ms**，wire prepare **1.339/2.010ms**，wire decode（含精确对照断言）**0.959/1.249ms**。不可把不同轮次 CPU 相减当严格性能同比，也不是网络延迟。
- 最终 authority Worker 测试：12 秒请求，稳态 physics **59.976Hz**，240 combat frames **全部含武器**、42240 weapon rows、0 errors/recoveries。整世界模拟消费延迟 200ms；该实验未包括真实网络、渲染和主进程压缩扇出。
- 安全回归包括原 SCC1、SCC2 切换、skip/write refusal、真实欠账下 HP 降级、3/4/5 人真实 loopback helper 回执、CRC 事务性、scope 切换、畸形 anchor/解压上限、未知目标/accessor/继承 setter、HP-only 与陈旧世界交错。最终 gate/Chromium/矩阵结果在下方追加。

## 仍需完成

武器状态不是完整战斗组件覆盖：装甲网格、系统生命周期/专用视觉、引擎、fighter、beam/mine、roster/deployment、FX/audio 等仍依赖整世界/其它通道。必须继续解决共享带宽预算与整世界更新，建立完整的 bootstrap/resync/component clocks，再接入 Steam 共同调度。不能因为运动/HP/武器更新快，就取消完整世界保护。

真实多机 Steam/n2n/硬件性能、实际 apply/render/input-to-photon 验收仍待做。此报告不是发布许可，也不宣布整体目标完成。

## 最终配对网络矩阵：节省了字节，但弱网回退仍存在

`lan-core-matrix-final.json` 与 `lan-weapons-spatial-matrix.json`：同一 241 帧、22 舰录制，3/4/5 人（含主机），每条件 20 秒、排除前 3 秒；分别独立 Node guest 进程，真实 loopback WebSocket/deflate/TCP，所有下行共享一个 FIFO 限速器，上行 32Mbps，无丢包。两组依次运行，没有同时跑其它性能测试。该脚本**不执行游戏渲染/物理/真实 n2n/Steam，也不执行游戏断流重同步策略**。

| 条件 | 仅核心时运动 Hz | 新武器扩展时运动 Hz | 新武器到达 P95 | 仅核心 / 新扩展 最差整世界到达 P95 |
|---|---:|---:|---:|---:|
| 3人 / 4Mbps / 60ms RTT | 52.35–52.71 | 52.94–53.24 | 73.45–74.21ms | 523 / 841ms |
| 4人 / 4Mbps / 60ms RTT | 52.47–52.88 | 50.76–50.94 | 86.76–89.40ms | 1659 / 1858ms |
| 5人 / 4Mbps / 60ms RTT | 44.94–50.00 | 38.94–39.06 | 106.67–107.79ms | 2767 / 3359ms |
| 3人 / 32Mbps / 20ms RTT | 59.76 | 59.88–59.94 | 41.04–41.32ms | 105 / 105ms |
| 4人 / 32Mbps / 20ms RTT | 59.71–59.76 | 59.53–59.59 | 40.97–41.32ms | 114 / 134ms |
| 5人 / 32Mbps / 20ms RTT | 58.47–58.65 | 58.12–58.29 | 44.95–45.71ms | 130 / 140ms |

每客机武器通道约 **19.94–20Hz**；这不是客机渲染 FPS。12 个条件均无脚本记录的组件 hash/解码/传输错误，仍不能等同于无实际断线。表中是**成功收到数据时的年龄**，不是连续观测状态年龄，未覆盖未收到更新期间的全部陈旧时间，更不是输入到画面延迟。

五人同一条件下，20 秒房间 combat wire：
- 仅核心：699960B。
- 较早的固定布局普通 XOR：3548662B，运动 28.53–29.88Hz。
- 仅时间参考：2847244B，运动 34.82–35.82Hz。
- 本轮同舰参考：**2098952B**，比仅时间参考少 **26.28%**、比普通 XOR 少 **40.85%**，运动 38.94–39.06Hz；但仍比不带武器的核心基线更占带宽。

这些是相同 fixture/条件的单轮对照，未给重复试验置信区间。新参考没有消除弱网总带宽竞争：5 人 synthetic input echo P95 从约 129–130ms 升至 140–142ms；整世界最差到达 P95 从 2767ms 升至 3359ms。相对于上一版时间参考，整世界年龄也没有稳定改善，不能只选武器延迟和 Hz 的好数值发布。

**结论：无损压缩改进保留，但新武器通道仍只供显式实验，绝不据此启用生产默认。** 下一步必须处理所有组件共享的预算、整世界残余内容与覆盖范围，而不是继续单独提高该通道速率。完整矩阵及 CPU/在途数据见 `matrix-summary.json`；原始数据和失败/被拒试验一并保留。

## 最终保留代码的验收记录

- `npm run network:check`：**375/375 网络检查 + 5/5 真实 Web 武器检查**，已纳入 Windows workflow，保留原来全部网络门禁。
- `npm run network:check:shared`：通过，分别 **20/20、6/6、81/81**，涵盖真实捕获/共享 codec/两种 authority adapter 等。各 gate 有重叠，不把合计当独立用例数。
- `npm run steam:check`：**337/337**，包括上一轮大状态与模型检查；仅表示未破坏既有 Steam 门禁，**不代表 Steam 已支持新武器通道**。
- `npx tsc -b --pretty false`：通过；这是实际项目 references 构建检查。此前 `tsc --noEmit` 对根 `files:[]` 不足以验证应用源码，不以它作为本轮 TS 证据。
- focused oxlint 和最后 CLI/注释修改后的 scoped lint：exit 0。
- `browser-final.log`：241 份 Node wire roundtrip（full1 / delta240 / 时间参考239 / 同舰参考240），20 份真实 headless Chromium 场景抽样还原；无限弹药2640项、持续光束118项，0 page errors，apply P50/P95 0.300/0.800ms。和普通整世界 restore、独立武器 apply、同 tick 陈旧 restore、更新的 HP-only 交错均逐字节相等；不是 renderer/FPS/WAN 验收。
- `worker-weapons-spatial.json`：最终 worker-only 重建明确检查无 campaign import；12秒、22舰、240/240含武器、0 errors/recoveries、稳态 physics59.976Hz。输出选项误用了原脚本未识别的 `--output`，该次先写入默认 artifacts 路径；完整 JSON 与同次 log 的最后3条 records/全部摘要逐项核对相同后复制到上述名字，**不是拿旧 benchmark 填补结果**。脚本现在保留 `--out` 并接受 `--output` 别名，避免再次静默写错位置。
- 全部本轮 exec handles 已结束；未保留后台游戏/可见浏览器或测试服务器，未使用子代理。没有进行 staging、commit、push、tag、打包或发布。

`artifacts/network-stream-20260921/phase11/source-sha256.json` 记录最终相关源码/报告散列，便于后续实验与本轮证据区分。所有数值仅说明各自测量条件，不能宣称已经根治用户的实际多人联机问题。
