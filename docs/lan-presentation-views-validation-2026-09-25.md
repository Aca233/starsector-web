# LAN 呈现视图边界与 HUD 去重：验收（2026-09-25）

## 结论
本轮改动已经用于默认 `LanBattle`，不是只添加离线 DTO：React 现在持有 `LanPresentationViews`，不再在 state 中持有完整 `LanDisplayWorld`。HUD、地图、部署、阵营统计及暂停菜单使用已有投影视图；地图命令仍由原来的观察者权限校验。

**完整接收/渲染 Worker 迁移仍未完成。** 默认收包、输入、镜头与 WebGL 调度仍在主线程。本轮没有 GPU compute、输入回执改动、网络提前 ACK、全世界跨线程复制，不能宣称已解决大规模模拟瓶颈或整体延迟。

## 保留的实现
- `src/network/LanPresentationViews.ts`：显式 HUD/map/deployment/presence/observer-command 端口；关闭后拒绝旧命令与读取，重复释放安全。
- `src/network/LanBattle.tsx`：默认 UI 直接消费该端口；会话替换时清掉旧端口，退出释放。接收、输入、同步、镜头跟随、渲染与 HUD 调度顺序保持不变。
- `src/engine/runtime/CombatHudView.ts`：新增仅供自有、无回调 LAN display records 使用的 `captureReadonly`。同一 capture 内每个舰船身份投影一次，重复数组槽位与别名仍保留。通用 `capture` 不缓存，保留原来逐次读取；不跨 capture 保存状态。
- `src/network/LanPresentationRuntime.ts`：同一端口也可在真实 Worker realm 内创建/读取；runtime 失败或释放时同步关掉端口。

该端口是 **same-realm 能力边界，不是跨线程 codec**。Vector2/HudContact 方法、可变定义、选择状态、音频/输入和信用回执仍需明确传输协议。不得直接 structuredClone 后强转为完整世界。没有接口可达的完整世界，不等于当前投影元数据都已拥有脱离源对象的所有权。

## HUD 局部工作量与耗时
同一个真实 22 舰 LAN display world，固定 seed917；40 组预热、180 组配对，逐组交替先后顺序，每组每路 8 次 capture。参考路是保留逐次读取的通用 projector，不是独立的旧浏览器二进制；两路同 realm，不包含跨线程复制。每次采样的完整值、类型、别名另行校验。

| 单次 HUD capture | 原逐次读取 | readonly 去重 | 变化 |
| --- | ---: | ---: | ---: |
| 均值 | 0.125753 ms | 0.055378 ms | -55.96% |
| P50 | 0.121250 ms | 0.052500 ms | -56.70% |
| P95 | 0.160000 ms | 0.077500 ms | -51.56% |

同一旗舰的系统列表投影读取 3→1；多个 roster 中的同一记录不再重建装甲/武器/系统。HUD 仍按原来的微任务/RAF 按需更新，不是降成 10Hz。

**绝对节省只有约 0.0704ms/次 HUD capture**；这不能换算成模拟加速 56%、FPS 提升 56% 或联机延迟下降 56%。当前没有真实联机延迟改善证据。

## 一致性、生命周期与真实 Worker
扩展既有 `check-battle-batching-browser.mjs` 的 Offscreen 分支，而非另建测试工程：
- 12 个二进制战场 fixture × 4 种锁定目标状态，共 48 组新旧 HUD/map/deployment/presence 对照；完整值、Vector2/HudContact 原型和引用别名一致。
- 可变定义、位置、武器、重复 roster、多次读取以及下一个微任务刷新通过。通用路径保留 3 次读取，只有显式 readonly 路径减为 1 次。
- 选择友舰、拒绝敌舰、关闭地图、拒绝越权命令以及释放后的 4 类读取/命令通过。
- 真实 Offscreen Worker 同 realm 内的 HUD/地图/部署/阵营读取通过；这不代表已跨线程连接到 React。
- 12 组 DOM/Worker 渲染对冻结修改前页面均零差异；上下文恢复和故障关闭通过。
- 主线程忙等 200ms 时 Worker 完成 12 次；这是既有独立执行能力的回归检查，不是本轮新增默认线程拓扑。
- 234 张 bitmap 释放，驻留纹理和 pending uploads 回到 0。

测试夹具初次导入错了 decoder 的模块、第二次遗漏当前页面资源 manifest 初始化，均仅修复测试，未放宽生产验证；两份失败报告保留在 artifact 根目录。修复后完整场景通过，没有因为失败重跑无关测试。

## 默认双端联机与主机重连
独立无头浏览器、D3D11/RTX5060，真实 LanBattle + LanConnection + host Worker + desktop helper，2 玩家+20 AI、seed917、15秒；前后源码冻结配对。steady、command-held、prediction、weapon、particle 输入事件夹具全部关闭，stall=false，reconnect=true。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 测量期推进 tick | 900 | 899 |
| 主机物理 Hz | 59.934 | 59.944 |
| 主机 FPS | 60.003 | 60.002 |
| 客端 FPS | 60.003 | 60.003 |
| 主机 input ACK P95 | 52.515ms | 50.919ms |
| 客端 input ACK P95 | 36.340ms | 40.694ms |
| 主机状态年龄 P95 | 20.265ms | 16.540ms |
| 客端状态年龄 P95 | 4.170ms | 9.490ms |

两路都无 failure/error，重连后 matchId 不变并继续推进，cleanupCompleted=true。主客端延迟变化方向相反，不能据这一轮宣称整体加速。输入为中性，未覆盖实际按键、鼠标瞄准、主动开火和菜单输入操作；没有用户桌面或原版实机验证。已有纯视图命令检查不能冒充完整 UI 交互验收。

## 文件与可复查证据
`artifacts/lan-presentation-views-20260925/`：
- `before-browser.json`：修改前653模块；SHA256 `70c1724bef9422c29031166a4b11e6149582a974b099f6049683d02ed20545dd`。
- `source-changes.json`：本阶段只修改3个、新增1个生产模块，各自冻结前后 hash。
- `offscreen/offscreen-result.json`：视图、局部计时原始样本、像素/Worker/生命周期结果。
- `lan-before/result.json`、`lan-after/result.json`：默认联机原始结果。
- typecheck/lint 日志：修正一次 effect 内同步 setState lint 警告后复查通过。

未暂存、提交、推送、打包或发布。生涯及其他既有更改保留。

## 未完成项
1. 生产 Worker entry/bridge：传输准入、epoch、消息顺序与网络消费 credits。
2. HUD/map/deployment 的有界、保留能力和可变定义所有权的跨线程协议；当前端口不可直接复制。
3. 镜头/瞄准/输入序号和动作确认、声音事件、设置、焦点/可见性及退出恢复的真正端到端连接。
4. 在上述完整路径中测主线程长任务及输入到屏幕延迟，再决定是否默认启用。
5. 大规模武器火控和快照成本仍是独立的模拟优化工作，不因本轮 UI 去重而完成。
