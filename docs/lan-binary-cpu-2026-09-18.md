# 联机快照二进制 codec CPU（2026-09-18）

## 范围与状态

仅修改 `src/network/BinarySnapshot.mjs`；声明接口不变，未编辑 `.d.mts`。未触碰 Host、LanBattle、CombatSnapshot、物理/AI 步长或显示插帧。保留 MessagePack 与 SWB1 envelope，协议版本不变，不增加字段、删除字段或降低数字精度。

本轮在共享工作区开始时先保存了文件实际内容（而非 Git 版本）：`artifacts/lan-binary-cpu-local/baseline-source.txt`。其他任务文件不回滚、不覆盖。

**采用：有界 FIFO 短字符串编码缓存 + 预检后的完整帧同步解码。拒绝：满后不收录的缓存、自制数值编码 writer。** 最终三种真实快照在 Node / Chromium 的配对 codec 测量均有收益，但不据此宣称解决百舰实时过载。

## 实现与安全边界

- 编码仍由锁定的 `@msgpack/msgpack` 3.1.3 负责全部数值编码、对象遍历、getter/Proxy 读取顺序、忽略 undefined、扩展处理、重入与输出独占副本。保留 `compatible()` 的整树兼容检查和超限检测。数值编码 writer 已消融后删除。
- 短字符串缓存存储完整 MessagePack 字符串字节，最多 1024 条、单字符串最多 128 UTF-16 code units。满后 FIFO 替换，避免初始无关字符串永久占满缓存。编码缓存有效载荷上界为 1024 × 387 bytes（另有 JS 容器和字符串开销）。不是无限生命周期的 ID 字典。
- `compatible()` 后 getter 若改为孤立代理项，编码回到库原实现，不使用 TextEncoder 的替换字符改变原行为。
- 解码继续完整运行原 `preflight()`：16 MiB 帧上限、128 深度约束、map 最多 65536 项、长度必须能装入剩余字节、禁止 bin/ext/timestamp/保留 tag、拒绝截断及尾随字节。在容器分配前保留原有防护。
- 通过预检后，用只支持此 JSON-shaped MessagePack 子集的同步递归 reader，替代流式解码器的逐标量容器状态机；不改变 pack 的数据表达，也不合并或省略 unpack 语义。
- map key 仍须为字符串，拒绝 `__proto__` / `prototype` / `constructor`；重复键仍为后值覆盖。
- uint64/int64 仍采用旧库的高低 32-bit 转 JS Number 算法，不转换成 BigInt、不截低位；unsafe 整数/float32/float64 保持旧库行为。
- 解码字符串缓存为固定 1024 slots，单条最多 128 bytes，复制持有字节，不持有整帧 Buffer/ArrayBuffer。冲突时逐字节比较，碰撞不会误命中；原始缓存字节上界 128 KiB。
- UTF-8 刻意保持锁定库的旧行为：长度大于 200 bytes 使用 TextDecoder 的 BOM/替换规则；短字符串有效 UTF-8 保留 BOM，遇到畸形 UTF-8 则整帧回退原 Decoder，兼容其短字符串 JS 解码器的宽松行为（包含越过字符串边界读取的历史语义）。不借 CPU 优化擅自改变输入接受范围。
- 正常 reader 与回退 Decoder 均为请求局部实例；失败不会把原始输入或部分对象图留在全局。缓存只保留有界短字符串/副本。

编码仅采用库内部 string writer / buffer hooks，虽然依赖已锁版本，升级 msgpack 时仍须重新验证。UTF-8 的 200-byte 分界同样与该版本绑定，不能静默随升级改变。

## 冻结真实快照与计时方式

- 8 舰：已有冻结真实引擎/世界 fixture，推进到 tick 600，采集战斗快照与 muzzle 事件窗口；存为 `artifacts/lan-binary-cpu-local/frame-8-t600.json`，旧编码 215723 bytes。
- 100 舰：已有真实 tick 1200 快照 `artifacts/lan-capture-cpu-local/profile-frame.json`，旧编码 1867608 bytes。
- 补充真实 8 舰 tick 3606 binary frame：`artifacts/lan-binary-live-frame.bin`，298143 bytes，含当前 `$record` / `$records` 批表达。不是只验证旧的未批处理 fixture。
- 只测 codec，不把模拟、capture、apply、WebGL、网络或插帧放进本地数字；不能与其他阶段收益直接相加。
- 旧/新模块独立实例；逐次交替先后顺序，两轮反转起始顺序，预热后保留原始样本。比较编码逐字节相等、解码逐字段/数值相等。
- 未新增项目测试文件或测试运行器。诊断通过 stdin/内存脚本执行，只把来源、快照与 JSON 结果写入 ignored `artifacts/`。
- 每次正式计时前向主代理申请独占窗口；完毕释放。浏览器为独立 headless Chrome，不占用或关闭用户/其他任务浏览器，finally 关闭。

## 初步计时与被发现的问题（不是最终采用依据）

`initial-ab.json`：Node v24.13.1，各 15 对预热，两轮各 50 对交替；正常快照 encode 均值减少 7.5–9.6%，decode 减少 18.9–22.7%。

`chromium-ab.json`：Chrome，各 20 对预热，两轮各 40 对交替；正常快照 encode 减少 18.7–24.7%，decode 减少 14.9–23.7%。

上述首版 encoder 缓存使用“满后不收录”。故意先编码 4096 个无关短字符串，发现 encode 收益消失，100 舰还退化约 0.6–2.4%；decode 仍减少约 17.7–23.0%。因此不以正常缓存数字掩盖问题，首版缓存策略已拒绝，改为有界 FIFO。以下复测才是最终采用依据。

## 最终消融、复测与采用依据

`encoder-ablation.json`：Chrome 152，旧版 / FIFO string-only / FIFO + number-writer 三组，20 轮预热，两轮各 45 次，三组轮换先后且第二轮反向。在正常 8/100 舰快照，自制 number-writer 比 string-only 慢 **7.1–14.1%**；饱和场景偶有小幅获益，不足以支持保留，因此删除数值 writer。string-only 的正常场景两轮均比旧版快 **16.7–20.5%**。

先以 4096 个无关短 key/value 填满所有模块缓存，再测同一真实帧：最终 FIFO string-only 在两轮均保留收益（8 舰 39.4–40.4%，100 舰 35.2–35.5%）。这是刻意饱和压力场景，也填满旧版的原有 validation cache；不能把这些偏大的百分比当一般实战增益。

`final-ab.json`：最终 string-only 编码 + 同步 reader，Node v24.13.1 预热 12 对、Chrome 152 预热 15 对，各 35 对交替。单位 ms/次，采用均值；原始样本与中位数一并保留。

| 运行时 | 真实快照 | 操作 | 旧 ms | 新 ms | 减少 |
|---|---|---|---:|---:|---:|
| Node | 8 舰 tick600 | encode | 1.848 | 1.552 | 16.0% |
| Node | 8 舰 tick600 | decode | 1.396 | 1.120 | 19.8% |
| Node | 100 舰 tick1200 | encode | 16.160 | 13.842 | 14.3% |
| Node | 100 舰 tick1200 | decode | 11.424 | 9.358 | 18.1% |
| Node | 8 舰真实 binary tick3606 | encode | 3.427 | 2.971 | 13.3% |
| Node | 8 舰真实 binary tick3606 | decode | 2.099 | 1.732 | 17.5% |
| Chrome | 8 舰 tick600 | encode | 2.377 | 1.777 | 25.2% |
| Chrome | 8 舰 tick600 | decode | 1.374 | 1.174 | 14.6% |
| Chrome | 100 舰 tick1200 | encode | 16.769 | 14.311 | 14.7% |
| Chrome | 100 舰 tick1200 | decode | 13.489 | 10.234 | 24.1% |
| Chrome | 8 舰真实 binary tick3606 | encode | 2.780 | 2.389 | 14.1% |
| Chrome | 8 舰真实 binary tick3606 | decode | 1.991 | 1.634 | 17.9% |

首个最终复测命令误将原始 binary frame 当成 SWB1 envelope，初始化阶段即失败；已修正为 decodeBinaryFrame 后重跑。不纳入有效样本，也没有通过修改 codec 接受错误格式。

最终代码快照：`artifacts/lan-binary-cpu-local/candidate-source.txt`。SHA-256：`eb9bf4eb3dabf202c6275947949119cee00c4ac0dcab14a84d238f309c1964d6`；旧源码 SHA-256：`9c7691a031ffb1aaecc7e592cf86a0f82c41e848756170e86e14c1aa75a85f5b`。

## 已完成语义与恶意边界

最终 `final-boundaries.json`：Node **16135 次 decode** 对照（14979 接受、1156 拒绝）、**2254 次 encode** 对照、**8 个 getter/Proxy/reentrant** 动态案例、**16 个 SWB1 header** 案例、**10000 个不同 key/value 的缓存 churn** 通过。包含：

- 数字各 tag、int64/uint64 全范围随机 bit patterns、unsafe number、NaN/Infinity、次正规数、负零。
- 字符串长度与数组长度编码分界、BOM/合法 Unicode/孤立 surrogate/畸形 UTF-8，短字符串邻接下一 token 的边界。
- 0–132 层嵌套，巨大伪声明长度，map 65536/65537 项，空帧、所有 256 tag、截断、尾随、bin/ext、非字符串 key、危险 key、重复 key。
- ArrayBuffer、非零偏移 Uint8Array/DataView、Node Buffer；编码结果跨下次调用不变且可 transfer 后继续编码。
- getters 后续改变类型/Unicode、Proxy 读取顺序、编码重入、循环引用；真实帧与 SWB1 envelope 逐字节/逐字段对照。

Chrome 首轮额外 126 项 int64/uint64、unsafe number 编码与 BOM/UTF-8 对照通过；解码实现随后未改。最终 Node 10000 项 churn 和真实帧回归后，encoder 1024 条、编码 payload 共 13502 bytes；decoder 固定 1024 slots、字节副本共 13599 bytes。缓存不会随不同 ID 数量无限增长。

比较输入接受/拒绝与返回值/字节，不要求 Error 子类或报错措辞完全一致。首轮结果另存 `boundaries.json`，最终采用策略已重新完整回归。

`node --check src/network/BinarySnapshot.mjs` 与定向 `oxlint` 通过。未运行全项目 build/typecheck，以免与主代理共享工作区的联机集成与测量竞争；全链路集成验收归主代理。

## 局限

本地静态帧重复基准不是多帧长时间实战；已补饱和、10000 不同 key/value 与另一个真实 binary 快照，但不代表所有未来场景。跨运行绝对时间有波动，短测主要支持配对均值收益，不能保证尾部延迟。库内部 string hooks 和旧 UTF-8 阈值属于显式维护成本。畸形短 UTF-8 为兼容而回退，并不承诺这类恶意输入比旧版更快。

端到端 Worker + parse/apply + WebGL 测量由主代理负责；本记录不保证百舰达到实时、不把 codec 的百分比当整场 FPS 或总 CPU 改善。
