# LAN 实际呈现所有者：接入与验收（2026-09-25）

## 本轮交付
**正式 `LanBattle` 已使用 `LanPresentationRuntime`，但呈现仍在主线程。** 这不是新的 Worker 默认模式，也不是模拟或输入延迟提速的结论。

- 收包的离散事件、播放队列、已应用 tick/latest、显示世界、预测、渲染器和 UI 端口现在由同一个 runtime 管理，真实页面不再另建一套播放/预测/渲染生命周期。
- runtime 支持首包/manifest 就绪前创建；controls 和 camera 保留页面原引用。阶段顺序仍为恢复 endpoints → 同步 gate → pose（再读 aim）→ camera → effects/render，apply 计时不把播放采样算进去。
- `stop()` 保留末帧端点及已确认 muzzle/particle 窗口；`resetPlayback()` 清空同步凭据和旧效果；`dispose()` 关闭 UI 能力、释放 renderer，迟到的资源准备不能返回 ready。失败时页面撤下已关闭 UI 端口，避免再次读取。
- 清掉加载完成、重连和停止时 `firstFrame` 的额外引用，不再把旧 bootstrap 快照一直留到本局退出。没有做 heap 配对，因此不量化内存收益。
- 世界未就绪时，命令键/系统滚轮不再直接解引用未建立的玩家舰船；没有改变就绪后的命令、预算、预测记录或动作序号。

## 没有做的事
没有新增生产 presentation Worker、跨线程 HUD codec、GPU compute、并行火控或对象池。没有降低 tick、视觉效果、实体数或校验强度。

特别保留 `protocol.ts:317-324` 的客端 decode、`protocol.ts:416-429` 的同步消费回执，以及本地主机 `LanSnapshotDecoder` 的两普通帧+一末帧 credits。它们不能把异步 postMessage 当作已消费。完整迁移仍需要有界/带 epoch 的异步接收与失败处理、只传 HUD/map/deployment 必需数据的协议、输入/镜头/音频/设置顺序，以及真实主线程忙时的时延验收。

## 集中验收
### 静态
一次 `npm run typecheck` 和五个改动源码/测试文件的 oxlint 均通过，无需失败后重跑。`git diff --check` 对改动的 tracked 生产文件通过。

### 既有 Offscreen 场景
`check-battle-batching-browser.mjs` 的 `OFFSCREEN_RECEIVER_CHECK=true` 分支，启用 pipeline/views/owner 检查；旧 DOM 使用本轮冻结的生产模块，新 DOM 使用正式 runtime，Worker 使用真实 OffscreenCanvas 和同一个 runtime。D3D11 / RTX 5060。

- 12 组正常、伤痕、过载、残骸画面：新 DOM 和 Worker 对旧 DOM 的通道差异全部 0。
- 48 组 UI 投影/原型/别名/每微任务更新/观察者权限回归通过。
- 新生命周期合同：首包前接收、重复 tick、重连重置、稳定 camera 引用、拒绝替换 live world、apply 回调顺序、stop 后保留并应用最终端点、重连清效果、坏帧失效、无世界时退出、加载后迟到 ready 被拒绝，全部通过。
- 原生 context loss/restore、坏帧关闭、重复 dispose 通过；最终 234 张 Bitmap 已关闭，驻留纹理与待上传为 0。
- 既有 200ms 主线程阻塞探针中 Worker 继续完成 12 次；仅证明测试 Worker 的隔离能力，并非正式联机已迁移。

场景附带采集的 before/current DOM/Worker 全段均值约 9.674 / 9.860 / 10.686ms；包含测试用 gl.finish、不同 realm/JIT 和固定执行顺序，**未显示新的稳定计算收益，不用其中任一子项冒充本轮提速**。既有 readonly HUD 投影比较是旧优化回归，不是本轮新增收益。

### 真实默认 LAN + 主机重连
既有 `check-normal-multiplayer-browser.mjs` 一次：2 玩家 + 20 AI，seed917，15秒；steady、command-held、prediction、weapon、particle 夹具均 false，stall=false，reconnect=true。无键鼠注入、无可见窗口。

- 14,999ms 测量窗推进 899 tick；主机物理 Hz 59.971。
- 主机重连从 tick1104 继续至1296，matchId不变，实际走完 direct authority 回退。
- failures/errors 均为空，cleanupCompleted=true。
- 诊断值：主机/客端 FPS 60.003/60.003，input ACK P95 47.135/41.190ms，状态年龄 P95 16.485/9.010ms。

**这是同机 loopback、未加载样式的 300×150 canvas、无活动操控夹具的接线验证。** 不是大分辨率帧率基准，不是实际鼠标到画面的延迟，不代表 Steam/WAN；未做本轮 before 联机配对，不能宣称速度提升或完整无回归证明。原版实机/交互验收仍未做。

## 源码范围与证据
修改前冻结 656 个非生涯生产模块；只有 `src/network/LanBattle.tsx` 和 `src/network/LanPresentationRuntime.ts` 发生变化，其余 654 个 hash 一致。保留此前 LAN 火控优化及所有无关 WIP，未暂存/提交/推送/打包/发布。

证据目录：`artifacts/lan-presentation-owner-20260925/`
- `before-browser.json` / `source-changes.json` / `acceptance.json`
- `offscreen/offscreen-result.json` / `offscreen.log`
- `lan/result.json` / `lan.log`
- `typecheck.log` / `lint.log`

本轮成果是正式路径的所有权接入及生命周期清理；完整 Worker 迁移和可量化时延收益仍未完成。
