# LAN 无损浮点字节分组候选：不接入默认路径（2026-09-19）

## 结论

**候选已实现并验证无损，但当前 SWF2 基线下没有净收益，不上线、不打包。**

Steam 中「float64 按字节位置分组再压缩」的思路可以移植，实测收益不能照搬。LAN 已有 MessagePack、字段字典、短字符串缓存及远端 WebSocket deflate；在三份已有的完整 32 舰录制快照上，这个候选压缩后反而增大 2.05%–4.92%，Node / Edge Worker 编解码也明显变慢。

这只否定本次**整帧 float64 八平面后处理候选**，不是证明任何数值编码优化都不可能获益。没有以减精度、删字段、降模拟频率、放宽失联超时或改变测试门槛来换取通过。

## 实现范围

新增的 `src/network/experimental/LanFloatPlanes.mjs` 是不依赖 Node 的字节转换器：

1. 原 `encodeProjectedBinaryFrame` 生成完整 SWF2，行为不变。
2. `shuffleLanFrame` 保留所有 MessagePack 标签/字符串/整数/字段名字典键；仅将每个 `0xcb` 的 8 个 float64 字节重排为八个平面。
3. 实验帧使用 `SWP1`，12 字节头为 magic、LE skeleton 长度、LE float64 数量。骨架仍包含原 SWF2 前缀，解码后原始 SWF2 **逐字节相等**。
4. `unshuffleLanFrame` 先验证结构、深度、声明长度、float 数量与总长度，再分配受限输出；最后仍交给原 `decodeBinaryFrame` 做语义校验。保留 LAN 的数字字典键、UTF-8 兼容行为和安全键规则，不复用 Steam 的字符串键限制。
5. 保留 LAN 的 16MiB、depth128、65536 map entries 边界。没有引入 Steam 的约 512KiB、depth96 或 65536 总节点限制。扫描栈随深度有界，不保留与节点数同比的 float offset 列表。
6. 少于两个 float64 或加头后超过预算时返回 null，调用方应保留原 SWF2；原对象编码中的 JSON fallback 完全不动。返回值是独立 owned buffer，可转移给 Worker。

**没有协商该格式。** 原游戏/服务器不导入这个模块，旧解码器明确拒绝 SWP1；不能直接发给旧客户端。后续任何真正接入必须另行做双方/relay 能力协商与完整对局测试。原来的 SWB1、协议号、网络 Worker、消费额度、广播、Steam 路径均未修改。

## 冻结输入与试验方法

使用 `artifacts/lan-worker-latency/snapshot-32-{0,1,2}.bin`，解析的是完整世界树，不是只提取数字数组：

| 快照 | SWF2 字节数 | 原录制文件 SHA256 |
|---|---:|---|
| 0 | 185926 | 96ce83432dc6ada8908dee9e2e28e049dc0c834b9bbcedcce673dd83a848cbc3 |
| 1 | 206737 | db73f582e1eaca2df6475ef56304fc468983b9a9dfd90801e08cfb2c45eb458d |
| 2 | 339502 | 93ea8f5ebb881fa5de2ff09257e21e57ce8b7a603e2c914882f954217eb85522 |

- 同一份 portable probe 同时在 Node 24.13.1 和 Edge 153.0.4234.46 的真实 Dedicated Worker 执行。
- 每帧/每种方案/每个阶段预热 30 次，6 轮 × 每块 20 次采样，AB/BA 交替，原始样本保留；不只挑最好的一轮。
- host 指完整原编码 vs 原编码＋字节重排；guest 指原解码 vs 还原＋原解码。输入准备及结果核对在计时外。
- 核对完整字节、JSON 树/键序、转移后的 detach 与再次编码一致性；浏览器实际 postMessage 回传候选缓冲区，并与 Node 候选字节比较。
- 压缩使用当前 `lanPerMessageDeflate()` 参数（level1/memLevel7，无上下文接管），实际 SWB1 消息信封，RFC7692 `Z_SYNC_FLUSH` 并去掉/补回尾部四字节。不是拿普通 Z_FINISH ZIP 大小代替 WebSocket 压缩。
- 没有开 HTTP/WS 监听。Edge 使用专属临时 profile；测试 HTML 在进程内拦截返回 `.invalid` 页面，其他请求阻断，不解析/访问该域名。页面只是容纳 Worker，不运行游戏。
- Worker 页为 visible、非 crossOriginIsolated（该编码不需要 SAB）；不把这种微基准冒充隔离后的完整游戏性能。

## 结果

### 实际压缩体积（包括 SWB1 信封，不包括 TCP/TLS/WebSocket 帧头）

两轮成功试验的输出体积完全一致。

| 快照 | 现有 LAN / B | 候选 / B | 变化 |
|---|---:|---:|---:|
| 0 | 32982 | 34584 | **增大 4.86%** |
| 1 | 39707 | 41659 | **增大 4.92%** |
| 2 | 97893 | 99898 | **增大 2.05%** |

未压缩的 loopback 路径本就不应受益，候选只会多 12 字节和转换成本。

### Edge Worker（每帧平均毫秒，三份录制快照等权）

| 阶段 | run-2 现有 → 候选 | run-3 现有 → 候选 |
|---|---:|---:|
| 房主编码 | 1.679 → **3.464**（2.06×） | 1.663 → **3.558**（2.14×） |
| 客机解码 | 1.388 → **3.240**（2.33×） | 1.357 → **3.204**（2.36×） |

run-3 的 host P95 为 2.60 → 5.40ms，guest P95 为 1.90 → 4.70ms。Node 两轮成功试验中，host 约 1.96–2.00×、guest 约 2.10–2.25×。这些是 Worker/函数耗时，**不是输入确认、网卡 RTT 或画面呈现延迟**。

报告另列一个 Node CPU 估算：单次房主编码＋relay 解码＋客机解码＋一次压缩/解压的均值之和。它考虑 relay 也需校验，但未含所有生产 handler/异步队列成本，**不是测得的端到端延迟，也不能用来宣称完整对局性能**。

预先记录的候选门槛：每份快照压缩至少节省 10%；host/guest 各自 CPU 回退不超过 10%；P95 额外耗时不超过 1ms；Node CPU 估算回退不超过 10%。本候选两轮均不通过。因此停止在候选阶段，**不增加网络格式协商、不进行带此格式的完整对局 A/B、不启用默认路径**。

## 验证与保留的失败

- `scripts/check-lan-float-planes.mjs`：最终 **16/16**。包括 5000 个确定性随机有限 double、IEEE 特殊 payload 位、所有整数宽度、数组/字典/字符串各种头、旧 JSON fallback、非法键、旧 UTF-8、截断/伪造头/compact 容器炸弹、depth128、大于 Steam 限制的数组、65536 项 map、16MiB 边界、独立缓冲区和转移。
- 全项目 lint / typecheck 通过；默认入口依赖检查与原生产文件 hash 对照另存 `verification.json`。
- run-1 Node 已完成，浏览器模块 Worker 在 opaque about:blank origin 启动失败。错误及 Node 数据保留在 run-1，**不算通过**。runner 改为完全在进程内返回的有源测试页面，run-2/run-3 通过，生产编码未因测试环境修复而变化。
- 首次单元试验有一条测试样本把 18 个标量声明为 17 项而失败；修正样本头后通过，没有放宽编码器校验。
- 两轮成功试验源码各自前后 SHA 一致；每轮真实浏览器结束后 close，Worker 结束时 terminate。未退出用户浏览器、重启桌面/3005、初始化 Steam、打包或部署。
- 这不是双物理机器、双 Steam 账号、实时输入/绘制或断线复现。**本次没有交付新的联机修复版本。**

## 复现与证据

```powershell
node --test scripts/check-lan-float-planes.mjs
node scripts/bench-lan-float-planes.mjs --browser --playwright-module "<已安装 Playwright 的绝对模块路径>" --out "artifacts/lan-float-planes-retest"
```

如不用默认录制位置，可在命令末尾传入三份完整 32 舰 SWB1 文件路径。`--out` 请用新目录；报告采用独占写入，避免覆盖既有失败或测量。Playwright 不是新依赖，没有改 package.json；可通过既有依赖或 `PLAYWRIGHT_MODULE` 环境变量指定。`--edge` 可显式指定已有 Edge 可执行文件。不带 `--browser` 只做 Node 测试，不足以通过候选门槛。

数据目录：`artifacts/lan-float-planes-20260919/`

- `production-before.json` / `verification.json`
- `unit-tests-final.txt` / `lint.txt` / `typecheck.txt`
- `run-1/browser-failure.json` / `run-1/node-*.json`
- `run-2/`、`run-3/` 的 `plan-and-provenance.json`、`node-codec.json`、`node-compression.json`、`edge-worker.json`、`decision.json`、`cleanup.json`

后续应保持当前 LAN 二进制格式与已有消费窗口优化。若继续探索编码布局，须另做新候选和真实基线对比，不能把 Steam 对 JSON 的节省比例复述成 LAN 的收益。
