# LAN 异步观察命令通道：验收（2026-09-25）

## 本轮交付及性能边界
为呈现侧移出主线程补上有界的异步观察命令通道：地图开闭、友军观察选择，以及真实执行结果对应的 UI 状态确认。生产 `LanPresentationRuntime` 可创建该端点，实际无头 Offscreen Worker 已验证其往返。

**默认 LanBattle 仍是主线程呈现，原本同步的地图操作仍同步完成，没有新增消息往返/定时器等待，也没有默认增加每帧 UI 编码。** 本轮没有配对吞吐、FPS、主线程长任务或 input-to-photon 测量，不报告新的提速百分比。它是迁移所需的正确性与有界排队基础，不是完整 Worker 迁移，更不是 GPU 模拟。

## 行为与所有权
- 远程端只接收地图开/关和选择。选择由实际所有者在执行时通过既有战术观察逻辑再次核对；提交后已经退场的舰船不能继续被选中。战术下单、目标、撤退等权威命令不从该端口执行，部署/撤退仍走现有服务器请求。
- 请求使用 owner/epoch/id，按序执行。重复相同请求只重发结果，不重做浮字/音效/写世界；不同内容复用 ID 和跳号失败关闭。已淘汰的旧 ID 也不能重新执行，旧代际请求被忽略。
- client 等待表和 owner 幂等历史分别最多16项。UI发布仍最多一包在途；有命令但信用忙时仅置 dirty，回执到达后捕获最新状态，不缓存后续整帧。
- client 成功需同时拿到实际执行结果和 **revision >= 执行时下一 UI revision** 的状态。旧 UI 即使在命令后才送达，也不能触发成功。两种到达顺序都支持，并按请求顺序结算。
- UI确认表示主线程已解码并发布读视图，不证明下一帧已经绘制到屏幕。UI信用仍不等于服务器/模拟消费信用。
- 6秒命令超时明确报告“操作状态未知”，不假装已取消远端执行，也不自动重试。显式 reset/关闭拒绝未完成 Promise，递增 continuation 代际；过期回调不得重开菜单。
- 只捕获命令执行期间的 UI play 事件（最多2项），由主线程在完成上述确认后播放一次。没有迁移完整战斗音频。原有开地图无音效；选择 `map_open` .8、清选 `command_deselect` .7、关闭 `map_close` .85 不变。
- 默认 `LanBattle` 的打开地图、部署确认后的关闭已走视图端口。部署先等服务器确认，再等呈现侧关闭确认，不再无条件假定同步关闭。等待地图时屏蔽飞行输入；stop/freeze 撤销请求同时恢复 overlay 输入状态，避免重连后残留屏蔽。
- source 已撤销时，地图/部署迟到的异步回调安全退出，避免对失效读视图抛未处理异常。

## 验证结果与修复轨迹
按项目约定扩展既有 Offscreen 场景；没有新建测试工程、启动可见窗口或注入键鼠，也没有子代理。

### 静态检查
- 首轮 `typecheck` 发现本轮新文件 TS2322（`unknown` 的 null/string 收窄）；lint 有一处 `no-this-alias` 警告。
- 定向修复后 `npm run typecheck` exit 0；8个生产文件和4个测试文件 scoped oxlint exit 0。完整工作区类型检查是在执行时的状态通过，不代表验收了其他并行 WIP。
- tracked 改动 `git diff --check` 通过；本轮源文件/测试文件的尾随空白检查通过。

### 首轮既有场景
`offscreen/offscreen-result.json`：passed=true、errors=[]。
- 19项新命令逻辑检查：默认同步、提交不等于执行、执行不等于 UI 确认、两种到达顺序、所有者重新校验、权限拒绝、幂等、音效、过期 continuation、16项上限、超时未知结果、发送回调后异常、跳号/冲突/坏回复等。
- 实际 Worker 使用生产 runtime command owner：旧 UI 信用阻塞成功；归还 buffer 后收到新 UI 才成功；选择/关闭、重复请求不重复浮字/音效、reset/迟到请求通过。
- 生命周期 owner 检查通过，包括资源尚未准备好时 dispose 必须关闭命令端点且不迟到就绪。
- 上一块 UI codec 的21项帧/坏包检查（含12帧）及共享 render codec 的4帧精确对照通过。
- 既有纯 UI Worker 五个 revision、真实 buffer 转移回收、背压、重同步、关闭通过。
- 该运行走 UI/命令专项分支，`cases` 和 `samples` 为空；没有执行本轮完整像素或性能对比，不将其误报成像素基准通过。

### 最终定向复查
修复类型收窄和输入清理后，不重复全套：
- `command-recheck/offscreen-result.json`：19项命令检查与实际 Worker 命令往返再次通过，passed=true、errors=[]；紧接命令 owner 关闭后创建普通 publisher 的五次 UI 往返也通过，覆盖混合端点生命周期。
- `input-state-result.json`：56组输入状态组合通过。通过 TypeScript AST 提取并执行实际 `LanBattle` stop/freeze 清理前缀及三个 overlay 关闭回调，确认清 token 后恢复 overlay、其他关闭操作不丢失 pending-map 屏蔽。这是源码回调级检查，**没有挂载 React，也不是真实键鼠测试**。
- 退出后渲染资源 residentTextures=0、pendingUploads=0，关闭230个 bitmap；绘制/应用/输入端口均拒绝关闭后的调用。

## 原版与实机核实范围
原版证据已在实现前记录于 `lan-presentation-commands-source-notes-2026-09-25.md`（0.98a-RC8 配置/API/声音资源）。本轮不修改布局、快捷键或模拟规则；没有原版实机/同分辨率截图对照，没有 Web React 交互或正式双端 LAN 端到端延迟验证。音量及完整交互的原版等价仍待核实。

## 源码和证据
新增生产文件 `src/network/LanPresentationCommands.ts`，修改7个已有生产模块；测试新增 `scripts/lib/lan-presentation-commands-check.mts` 并扩展3个既有 Offscreen/owner 脚本。

证据目录：`artifacts/lan-presentation-commands-20260925/`。
- `before-browser.json`：660个非生涯模块，SHA256 `3539b79088c92489369a64292336309c5a905bfd0b93a78a18137f96e38a9b47`。
- `current-browser.json`：只替换7个本轮模块并新增1个，共661个；其余653个已有模块与基线一致。
- `source-changes.json`：每个本轮模块及测试文件哈希，并列出实际工作区相对基线的无关并行漂移，不覆盖/验收这些更改。
- 保留首轮失败 typecheck/lint 日志、最终静态日志、两次专项场景结果、输入状态探针脚本/结果，以及 `acceptance.json`。

版本仍为0.2.11；没有暂存、提交、推送、打包、发布或替换已安装游戏。

## 下一关键工作
将原始网络 decode/delta、世界恢复和渲染放进同一个正式呈现 Worker，并接通 state/motion/combat/本地主机消费信用；补齐飞行输入、相机、已接受 action 的时序、完整音频/设置及 Canvas 失败回退。完成后才适合默认启用并在真实联机及主线程繁忙场景测端到端延迟，避免线程更多但拷贝、排队和旧帧积压反而更严重。
