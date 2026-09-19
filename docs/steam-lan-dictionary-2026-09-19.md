# LAN 字段字典反向复用到 Steam：两个离线候选（2026-09-19）

## 当前结论

**有局部收益，但不能全量替换，也没有接入默认联机路径。**

- `dictionary`：LAN SWF2 字段字典用于所有 Steam 状态信封，不增加浮点字节重排。真实录制的第一份完整 32 舰状态从当前实验 SMF1 的 **39939B → 33657B（约 -15.73%）**，但合成高频差分从约 1342B → 1446–1448B（约 **+7.76%–7.92%**），不采用全量替换。
- `anchorDictionary`：完整信封（`base:null`，包括完整锚点及完整状态回退信封）使用字典；差分继续现有 SMF1，**不在字典上叠加浮点重排**。同一真实完整快照保留节省，合成差分字节数与 SMF1 一致。但微基准有一次 guest 解码门槛未过，正常 9 客机模型仍达不到原吞吐门槛，尚不能发布。
- 两份更大的原始录制状态（524484B、833645B canonical JSON）超过原 512KiB delta ceiling，仍走原始 JSON full fallback。没有删字段、缩舰队或扩大安全预算让它们“通过”。

这里的 `packed`/SMF1 是当前 **实验 Sockets** 对照；`json` 是原 SteamPacketCodec 编码对照。不得把实验结果写成已安装 legacy-P2P 桌面包已经优化，更不能保证用户真实 Steam 断线已修复。

## 代码和边界

新增文件：

- `server/steam/experimental/dictionary-state-codec.mjs`
- `server/steam/experimental/anchor-dictionary-state-codec.mjs`
- `scripts/check-steam-dictionary-codec.mjs`
- `scripts/bench-steam-dictionary-codec.mjs`
- `scripts/check-steam-dictionary-link.mjs`

复用原 `encodeProjectedBinaryFrame` / `decodeBinaryFrame` / `KEY_DICTIONARY`。不是重新维护一份字典，也不修改 LAN 的 Encoder 内部实现。

实验格式 `SKD1`：24 字节头，包含 magic、canonical JSON byte count、现有字典内容 SHA256 的前 16 字节，再接完整 SWF2。字典不匹配直接拒绝，防止同一个数字 key 被另一版字典解释为别的字段。

在 LAN 通用解码器分配容器前，另做 **Steam 边界**预检：约 512KiB+4096、depth96、总节点65536（包含已声明的子节点），严格 UTF-8、禁止 binary/ext、NaN/Infinity/-0、unsafe int64、非法 map key；只允许已知 positive-fixint 数字字典键。不把 LAN 的 16MiB/depth128 上限复制给 Steam。普通字符串键、数字值和完整精度保留。

JSON canonical 不一致、lone surrogate、危险属性键、BOM 开头字符串等不适合复用 LAN 解码语义的情况，保留原 JSON。BOM 特判是为了避免 LAN 旧长字符串解码的 BOM 剥离行为改变内容，不修改 LAN 默认解码器。原 Steam hash/size/base/match/token 的校验继续由原 receiver 执行。

`dictionary` 每次比较原 JSON 压缩结果，仍要求额外节省超过 16B 才选择新格式；缓存是有界的一份 prepared。`anchorDictionary` 分别持有全量字典与旧差分 codec 的有界缓存，并在 clear 时清理两者。广播共享继续沿用现有房间 encoder/prepared 复用，不更改 nonce、分片、ACK 或窗口。

**没有新增生产能力协商。** 两个候选显式禁止 legacy SWSP `.encode()`/`.frame()`；默认 SMF1 解码器拒绝 SKD1。离线模型只在 artifact bundle 中替换两端的 codec/decoder，借用 packed payload 标记做封闭实验；该标记不是新格式的真实兼容性声明，bundle 绝不能部署。

## 编码和广播成本

数据：`artifacts/steam-lan-dictionary-20260919/bench-1/`、`bench-2/`。

### 完整录制状态（保持全部 32 舰）

体积包含 64B 应用分片头（8192B 分片），不含 SDK/TCP/IP/加密开销。两个实验的体积一致。

| 原始 JSON 字节数 | JSON 对照 | SMF1 对照 | 全量字典 / 限定全量字典 | 说明 |
|---:|---:|---:|---:|---|
| 470837 | 50255 | 39939 | **33657** | 满足原 delta/full 信封预算 |
| 524484 | 59152 | 59152 | 59152 | 原始 full fallback，完整保留 |
| 833645 | 134673 | 134673 | 134673 | 原始 full fallback，完整保留 |

bench-2 第一份录制状态的完整准备中位耗时：JSON 9.73ms，SMF1 21.55ms，限定全量字典 17.28ms；解码/状态校验 SMF1 12.49ms、限定全量字典 10.17ms。准备包含原 parse/hash/full 压缩，不包含游戏演算、初始 JSON 序列化或网络排队。不能外推为输入确认或实际帧率提升。

### 9 客机广播

固定合成状态、每轮120帧，预热30帧，计时统计跳过最初20帧；2轮反向顺序。覆盖私有/共享 codec、相同/9个不同确认锚点。**每一帧全部9个接收者**解码应用后都逐字核对完整 JSON，不只核对第一位。各组原始 host/guest/字节采样均保留。

| 共享模式 / 轮次 | SMF1 房主中位 ms | 限定全量字典 ms | 差分体积比 |
|---|---:|---:|---:|
| 同锚点 / 1 | 1.829 | 1.888 | 1.000 |
| 同锚点 / 2 | 1.981 | 2.012 | 1.000 |
| 不同锚点 / 1 | 6.475 | 6.686 | 1.000 |
| 不同锚点 / 2 | 6.933 | 7.143 | 1.000 |

纯字典差分在两轮均扩大约 7.8%；限定全量字典避免了这个确定的带宽回退，但不是零 CPU 成本，也不是所有合成全量包都会更小。不能把单个录制大锚点的 15.73% 当成整场总流量收益。

预先记录门槛：相对 SMF1 差分体积不增大，共享 host 和单 guest 中位 CPU 回退分别不超过10%。限定全量字典的第二轮同锚点 guest 实测 0.4881 → 0.5563ms（+13.97%），**保留为失败**。没有仅凭差分字节相同就推断测量一定无效，也未挑选较快轮次消掉该失败。各组绝对 CPU 时间有漂移，完整游戏/输入/绘制仍未测。

## 验证与当前交付状态

- 新候选 **16/16**：随机5000有限 double、精度/键序、字典指纹、JSON回退、字符串边界、畸形长度/容器、数值/深度/节点预算、缓存/clear、默认解码拒绝、原锚点 hash/base/seq 校验、全量限定路由与差分字节一致。
- 包括现有 Sockets codec/session/room 及上一轮 LAN 候选在内的 focused tests **98/98**；不是宣称全部 Steam 检查全绿。
- lint/typecheck 通过。14个受保护生产文件 hash 未变；默认 frontend/worker 依赖462项、relay/Steam依赖27项，候选模块导入0项。
- 初次测试有一个错误假设：带长重复 hash 的小信封也能压缩节省，不能强行要求它一定 fallback。改用真正无节省的小输入验证 fallback，保持原节省门槛不变；没有修改生产规则适应测试。
- 未初始化 Steam/DLL、未邀请玩家、未绑定网络监听端口、未启动桌面/浏览器、未关闭用户应用、未打包/安装/发布。

复现（在项目根目录，输出请用新目录，不覆盖历史）：

```powershell
node --test scripts/check-steam-dictionary-codec.mjs
node scripts/bench-steam-dictionary-codec.mjs artifacts/steam-dictionary-retest
node scripts/check-steam-dictionary-link.mjs artifacts/steam-dictionary-link-retest
```

编码基准依赖既有 `artifacts/lan-worker-latency/snapshot-32-{0,1,2}.bin` 三份完整录制；模型使用原脚本的固定合成状态。报告使用独占写入。模型会因保留的吞吐门槛失败返回非零，不能把该退出码改成通过。

各次 `plan.json` 保存源码 SHA、范围及门槛，完成后再核对源码没有在运行中变化；`verification.json` 保存独立候选分组门槛、生产 hash 与默认依赖检查。

## 不利网络模型：已完成，保留回退结果

结果：`artifacts/steam-lan-dictionary-20260919/link-1/summary.json` 及各场景完整 JSON。使用原 `steam-sockets-link-model.mjs` 的真实 room/session/wire/pacer 逻辑与**模拟** native lanes、拥塞在途、共享 FIFO、传播/序列化和回执；仅在离线 bundle 中替换两端 full-envelope codec/decoder。此轮不再模拟已被体积门槛拒绝的“全状态字典”候选。

| 场景 | 当前 SMF1 更新 Hz / 最大年龄 P95 | 限定全量字典更新 Hz / 最大年龄 P95 | 原门槛 |
|---|---|---|---|
| 正常3客机 | 59.4–60 / 164ms | 59.4–59.8 / 164ms | 双方通过 |
| 正常9客机 | 28.6–30.6 / 180ms | 27.2–29.6 / 184ms | 双方失败：每人≥40Hz且总和>420Hz |
| 9客机，12秒时8Mbps→256Kbps | 1.0–1.2 / 1692ms | **0.6–1.0 / 3272ms** | 对照通过；候选一人年龄超过3000ms |
| 9客机，启动即512Kbps | 2.6–3.2 / 936ms | 2.8–3.8 / 812ms | 双方通过 |

- 8组共5组门槛通过、3组失败；包含原对照的正常9客机失败，不把它归为候选新引入的故障。
- 所有组没有断开、没有解码错误；终止时 wire/native pending 均为0。**未断线不等于延迟合格**。
- 骤降场景 host FIFO 峰值 143472B → 144776B，候选更新更慢且一位客机 P95 达3272ms，构成不能接入的明确回退。
- 虚拟模型保持原8秒保护、48/128KiB发送预算等不变；没有延长超时、扩大窗口或降低原门槛。
- 这些是固定模型的虚拟链路 Hz/状态年龄，不是实际 Steam SDK、双机器、真实账号测试。脚本 wallMs 只是执行用时，不能拿来比较真实网络 RTT 或游戏吞吐。

**最终决定：两个候选都保留为实验，不合入默认路径。** 字典在某些完整大状态上确有节省，但其整体调度与弱网表现没有通过。真实断线问题仍不能宣称已修复；后续若继续，应重新设计完整状态选择策略并保持现有差分/保护，不直接启用这版候选。
