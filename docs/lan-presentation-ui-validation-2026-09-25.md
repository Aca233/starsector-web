# LAN UI-only 跨线程数据通道：验收（2026-09-25）

## 交付与边界
已在生产 `LanPresentationRuntime` 提供可选 UI 发布所有权，并由实际 Offscreen Worker → 主线程接收场景验证。传输只有 HUD、战术地图、部署视图及阵营统计，**不复制完整世界，不传 renderer、弹体/粒子渲染图或模拟能力**。

**默认 LanBattle 仍使用同一线程直接视图，没有启用完整 presentation Worker，也没有在默认每帧插入编解码。** 新通道不是新的实测提速；本轮没有测主线程长任务改善、联机 input-to-photon 或大规模模拟吞吐。

## 实现
- `LanPresentationViews.captureForTransfer()` 由实际接收世界捕获新鲜 UI 数据，不从滞后的 React state 取样。
- 复用 `CombatPresentationEncoder/Decoder` 的受限顺序增量图，增加 UI-only envelope/channel。UI 只恢复 `Vector2`、`HudContactRecord` 方法，拒绝渲染/模拟原型和 visual payload；根结构、引用、预算、行为属性覆盖等检查仍执行。
- UI 定义保持在同一身份图，解决「动态定义与旧定义共享子对象」被独立 metadata 深拷贝拆开的缺陷。数值使用 Float64，验证了 NaN、正负 Infinity、负零及 undefined。未改变原 render metadata 路径。
- `LanPresentationUiPublisher` **最多一包在途，不保留后续 UI 快照队列**。等待时不再捕获/编码，下一次发布读取当时最新视图。网络 state 消费回执与 UI 回执完全独立，不能用 UI ACK 提前授予模拟/服务端信用。
- owner/epoch/revision 关联回执；主线程完成图解码及读视图发布后才归还 buffer，供下包重用。重复/旧代际/跨实例完成无效；未收到回执 5 秒关闭。发送失败、非法回收 buffer 失败关闭。
- 上限沿用已有图协议：最多 250,000 个 live nodes、8,000,000 个数值槽（UI buffer 容量不超过 64,000,000 字节），字符串/形状也有原有预算。这些是数据结构/编码预算，不是浏览器实际堆占用的精确上限。
- 接收方 HUD 为 live facade；地图/部署/统计保留冻结历史。历史复制按源节点缓存并检查变化，避免同舰型 definition 被逐行复制成不同对象。图 codec 的别名保持与冻结历史隔离是不同合同，不宣称历史与 live HUD 共享全部对象引用。
- runtime stop/reset 撤销旧 UI epoch，失败/dispose 关闭发布者；每个 runtime 至多一个活动发布者。接收方必须由可信的控制路径显式 reset(session)，不能让任意数据包自动安装新代际。
- **尚无远程 tactical 命令适配器**：接收方只暴露 read ports，未乐观返回「命令已接受」。命令仍需未来控制通道返回所有者实际结果。

## 验收结果
### 类型和 lint
首次全工作区 `npm run typecheck` 报并行新增的 `src/engine/content/ZhuYuanPack.ts` TS2352，与本轮修改文件无关；未擅自改它，也不把本轮说成全工作区 typecheck 通过。

为隔离并行修改，冻结修改前 657 个非生涯模块，再仅替换本轮 5 个已有模块并加入 1 个新模块，生成 658 模块候选图。通过 TypeScript CompilerHost 对 before/candidate 应用源码图检查，**两路诊断均为 0**。这是隔离应用源码验收；生涯和依赖仍读工作区，不等于所有并行 WIP 都已验收。

改动生产/测试文件 lint 通过；最终 receiver 与 Worker 测试修复分别复查相应文件。tracked 源码 `git diff --check` 通过。

### UI codec/消费合同（最终源码）
在既有 `check-battle-batching-browser.mjs` Offscreen 分支中扩展测试，没有新建测试工程。
- 12 个实际二进制恢复世界的 UI 帧逐值/原型/引用对照通过；包括地图开闭、目标、动态 spec 原地变更、重复 roster、特殊数值和旧节点回收。
- 9 类坏包校验（21 个帧/坏包基础检查），以及错通道、模拟对象、坏增量原子拒绝、不污染之前 HUD 等通过。
- 阻塞期 200 次 publish 全部跳过，期间只捕获首包；之后捕获最新状态，重同步后再捕获一次（全测试共 3 次，不是阻塞期间捕获 3 次）。
- ACK buffer 真转移/分离、重复确认、owner/epoch fencing、旧包拒绝、只在显式 reset 后安装新状态、超时、发送失败、关闭后不可读通过。
- 地图/部署历史在后续 delta 后仍保持原值。

### 真实 Offscreen Worker → 主线程（最终源码）
实际 runtime 创建 publisher，实际 postMessage 转移 UI buffer；主线程使用生产 receiver 并验证读视图，再转移 buffer 回 Worker。5 个连续 revision 的 HUD 方法、地图、部署、统计对照通过；在途阻塞、定义变更、重同步、迟到确认、关闭全部通过。

最终记录 `ui-worker-final/offscreen-result.json`：passed=true、targetedUiRecheck=true、errors=[]。生命周期退出后 230 张 Bitmap 关闭，驻留纹理及待上传为 0。测试 oracle 字符串属于测试消息，生产包不含这些比较数据。

### 共享渲染 codec 与画面回归
- **最终源码**对冻结旧 codec 做 4 帧实际 render graph 编码/解码 trace 比较，hash、数值和节点数完全一致。
- 较早的完整相关场景中，12 组 DOM/Worker 对旧 DOM 的 RGBA 差异均为 0；原生 context loss/restore 后画面一致；实际 runtime 的 stop/reset/failure/dispose 及 UI publisher 生命周期通过。
- 该次完整场景随后在新的 UI receiver「部署共享定义」比较处失败，**不能把该次整体称为通过**。失败记录保留在 `render-and-owner-passed-before-receiver-fix.json`。修复只涉及主线程 UI 历史复制，不改渲染器/编码路径；按约定最后只复查相关 UI/Worker 路径，没有重跑全部像素/GL 生命周期。
- 200ms 主线程阻塞时 Worker 继续渲染的旧隔离探针通过，但不是本轮新增性能结果。

## 实际修复和测试限制
保留日志包括：mutable definition 别名失败、测试夹具在下一帧重置为冻结 spec 的问题、Worker 测试 build-id shim 导入顺序问题、临时 TypeScript 比较脚本 Windows 路径大小写问题，以及真实接收方部署别名失败。分别修正相关实现或夹具后定向复查；不隐去失败。

全部后台/无头，未启动可见窗口或注入键鼠。没有新的原版 UI 实机对照，也没有本轮双端正式 LAN 基准。没有配对 CPU/FPS/端到端延迟测量；包内数值槽长度不包含 strings/shapes 等开销，不能用它冒充总传输字节或性能收益。

## 源码范围和产物
生产：
- `src/engine/runtime/local/CombatPresentationWire.ts`
- `src/engine/runtime/local/CombatPresentationEncoder.ts`
- `src/engine/runtime/local/CombatPresentationDecoder.ts`
- `src/network/LanPresentationViews.ts`
- `src/network/LanPresentationRuntime.ts`
- 新增 `src/network/LanPresentationUiTransport.ts`

扩展既有 Offscreen 场景/owner 检查并新增 `scripts/lib/lan-presentation-ui-check.mts`。

证据目录 `artifacts/lan-presentation-ui-20260925/`：
`before-browser.json`、`current-browser.json`、`source-changes.json`、`acceptance.json`、`typecheck.log`、`typecheck-comparison.json`、lint 日志、失败日志、`render-and-owner-passed-before-receiver-fix.json`、`ui-worker-final/offscreen-result.json`。

候选图中其余 652 个已有非生涯生产模块与基线一致。实际工作区仍有其它任务的同时修改，另列于 source-changes，不覆盖也不计作本轮成果。未暂存、提交、推送、打包或发布，版本未改。

## 余下工作
仍需完成原始网络 decode/delta → 呈现 Worker 的实际准入及顺序、motion/combat/本地主机消费信用，控制/输入/相机/音频/设置与明确命令回执，以及 canvas 失败回退；将这些接入正式 LanBattle 后，再测真实主线程繁忙时的端到端延迟。本轮不会默认打开一个不完整模式。
