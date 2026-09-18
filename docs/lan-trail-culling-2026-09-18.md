# 联机主线程热点：屏外尾迹剔除（2026-09-18）

## 结论

本轮已落地**保守的屏外尾迹剔除**。不减少任何模拟舰船、弹药或尾迹，不修改物理步长、战斗规则、快照频率策略、插值/预测或过载保护。只在整条尾迹确定不可能覆盖当前视口时跳过网格生成和 GPU 提交。

局部渲染回放的 CPU 提交耗时约 **0.495 → 0.125 ms/帧**（约降 75%），不是整帧/FPS/模拟速度的收益。24 组实际 WebGL 像素对照完全一致。32 舰新版双端两轮约 40 秒均 running、无恢复/错误，另有 32 舰刷新/断线后操控通过。

**100 舰仍未通过，目标未完成。** 新旧生产构建的百舰测试都触发真实计算过载；新版这次推进得更久，不等于解决了问题。32 舰基线本轮也短时运行成功，不能把所有改善都归因为此次剔除。

3005（PID 18988）及原 dist 未替换、未重启。本轮临时服务、Vite 和浏览器均已关闭。

## 采样：先区分 Worker 与显示开销

先使用上一轮明确失败过的隔离构建 `2026-09-18T04:22:00.597Z` / `host.worker-CTvB1qzI.js`：

- 不创建游戏显示世界，只运行原生产 Worker、消费其快照：32 舰约 32 秒到 tick1925，无恢复/错误，末段 simulationMs≈5.8、窗口实时倍率≈1.0024。
- 100 舰无显示仍在交战推进后触发过载：首次恢复 tick385，最终 Worker tick421。采样版首次恢复 tick164，终止 tick301；**采样有开销，不能把采样版时长当性能基准**。
- 这个简化 Worker 驱动只在启动时设置 presence；恢复后没有模拟完整服务器的重新同步/恢复 presence。所以百舰首次恢复后的数据不代表真实双端恢复流程，更不能据此归因全部后续过载。首次过载之前仍能说明：即使没有显示，百舰也会出现预算不足。
- 真实 32 舰双端的 16 秒主线程采样中，`RibbonBatcher.drawStrip` 是显著热点，房主自耗时约 1.15 秒；大量远离视野的尾迹仍逐点计算法线、填充顶点、上传。
- 两端 WebGL renderer 均为 NVIDIA RTX 5060 / ANGLE D3D11，非软件 SwiftShader。该次采样结束 running、0 恢复；不是“每次 32 舰都必然失败”。

Worker-alone 与完整双端还存在解码、还原、网络及资源竞争等差别，不能把差异全部当作绘制成本。选择尾迹热点，是因为有直接 CPU 栈证据，且可以独立验证输出保持不变。

## 正式修改

- `src/engine/render/webgl/ContrailVisibility.ts`：新增无缓存、无分配的整条尾迹 clip-plane 判断。
- `src/engine/render/webgl/passes/WebGLProjectilePass.ts`：绘制尾迹前调用该判断，保留所有未被确定排除的尾迹与原有绘制顺序。

安全边界：

1. 使用每点 `abs(currentWidth)/2` 包含 ribbon 两侧顶点，覆盖负宽度和重复点的法线回退。
2. 只有所有点的扩展区域都位于同一个视口外侧平面，才剔除。两端在屏外、但中间横穿视口的长线不会被漏掉。
3. 加入两个屏幕像素和 Float32/大坐标余量，保留边缘片元。
4. 无效 zoom/视口、非有限坐标/宽度走原绘制路径；无跨帧包围盒缓存，快照还原和本地更新改变点后不会沿用旧边界。
5. 使用 renderer 的实际视口（已含相机震动），没有修改渲染分辨率、帧率上限、特效数量或质量。
6. 没有改变 ContrailEngine 的 update、尾迹点存储及联机传输。

另修复当前工作区新出现的一处编译错误：`CapitalShipAI.weaponFluxResumeAt` 从 `0.65` 字面量推断改为显式 `number` 类型。只改该字段类型注解；前后 TypeScript 输出 JS 字符串完全相同，没有改并行任务正在编写的 AI 恢复逻辑。

## 数值和 WebGL 验证

- 40,000 组随机尾迹：39,282 组被判屏外；逐点使用原 drawStrip 的法线、宽度和 Float32 顶点计算核对，被剔除的条带所有实际顶点仍共享一个视口外侧平面，无漏检。
- 30 项异常/边界检查：非有限视口/坐标/宽度、无效缩放、跨屏长线、视口边缘宽条带、重复点等。
- 真实回放输入：同一 32 舰固定种子战斗 tick900，215 条尾迹、11,558 个点。
- 24 组 GPU readPixels 对照：真实尾迹和合成场景，不同镜头和缩放、负宽度、重复点、交叉长线、NORMAL/GLOW 混排，以及 18,000 点条带跨顶点缓冲容量；使用同一非平凡纹理/背景，旧新像素逐字节一致，GL 无错误。
- 局部渲染性能：真实回放、固定镜头 zoom=.4，六轮交替先后顺序，每轮排除前十次预热、统计八十次提交。旧均值 0.4952ms、新 0.1252ms；该视角 draw calls 2→1。`gl.finish` 在计时外，所以这不是 GPU 耗时或整帧耗时。

## 同源生产构建与双端对照

439 文件冻结依赖图；两构建仅相差剔除 helper 与调用，Worker 逻辑未因本优化改变。其他任务继续改源文件时不混入这次 A/B。

- 基线：`2026-09-18T04:39:52.827Z`，`artifacts/lan-trail-culling-baseline-preview`。
- 新版：`2026-09-18T04:40:29.068Z`，`artifacts/lan-trail-culling-candidate-preview`。
- 固定 seed2232494901；两真人守护者，每队 15/49 锤头；battleSize3200、initialDeploymentLimit1600，全部按场景规模部署。
- 经 UI 建房/加入、导入配装、准备/开始；AI 组成经既有 options 协议设置，未声称完整 AI 编队编辑 UI 验收。

| 顺序 | 构建 / 舰数 | 快照 tick/墙钟倍率 | 结束 tick | 状态 | 恢复次数 |
| --- | --- | ---: | ---: | --- | ---: |
| 1 | 基线 / 32 | 0.99905 | 2434 | running | 0 |
| 2 | 新版 / 32 | 0.99821 | 2434 | running | 0 |
| 3 | 新版 / 32 | 0.99655 | 2430 | running | 0 |
| 4 | 基线 / 32 | 0.98899 | 2408 | running | 1 |
| 5 | 基线 / 100 | 0.42962 | 67 | 过载结束 | 2 后失败 |
| 6 | 新版 / 100 | 0.83134 | 374 | 过载结束 | 2 后失败 |

32 舰每轮约 40 秒；100 舰提前失败后停止采样。100 舰最终 Worker tick分别为91/380，服务端 tick落后于 Worker 是最后一次发布的状态。所有场次无 pageerror。

倍率来自快照 tick 的墙钟窗口，受快照间隔影响；百舰只有一次顺序对照，不能将 0.43→0.83 宣称为稳定倍速收益。旧新均未通过百舰验收。后台其他任务未停止，机器负载未完全控制。

### 新版 32 舰操控与重连

约十秒不含解码探针的窗口倍率 0.97912；此短窗口同样有快照采样误差。随后检查按键输入、权威 throttle 与 ack，而非只看 UI 已连接：

| 阶段 | W 按下确认 tick / ack | 释放确认 tick / ack |
| --- | --- | --- |
| 初始 | 649 / 313 | 679 / 328 |
| 刷新客机后 | 796 / 353 | 809 / 357 |
| 主动关闭 WebSocket、自动重连后 | 905 / 374 | 929 / 385 |

按下 throttle=1、释放=0；两次恢复均取得新 syncId 并等 controls-ready 后操作。最后 running、双方 loaded，0 Worker recovery/error、0 pageerror，UI 战斗倍率1.01×。这是本机短时验证，不是跨机高延迟/丢包、Steam 或长时间稳定性保证。

## 编译、证据与下一步

- 冻结候选 TypeScript 检查、当前工作区最终 typecheck、lint、指定文件 diff --check 通过；两个隔离构建成功，只有既有大 chunk 警告。
- 检查期间曾遇到并行 UI 编辑的临时类型错误，后续消失；最后出现上述 AI 字面量类型错误，本轮仅作类型注解修复后重跑通过。没有整体回滚任何其他任务文件。
- 未创建项目测试文件/运行器，未进行素材 hash/size 审计。验证均为 stdin / 内存模块，数据与构建仅保存在忽略的 artifacts。

主要证据：

- `artifacts/lan-production-worker-isolation.json`、`lan-production-worker.cpuprofile`、`lan-production-worker-hotspots.json`
- `artifacts/lan-production-main-profile.json`、`lan-production-host-main.cpuprofile`、`lan-production-guest-main.cpuprofile`、`lan-production-main-hotspots.json`
- `artifacts/lan-trail-culling-frozen-sources.json`、`-source.json`、`-boundaries.json`
- `artifacts/lan-trail-culling-render-fixture.json`、`-render-validation.json`、`-typecheck.json`
- `artifacts/lan-trail-culling-comparison-live.json`、`-reconnect-live.json`、`-disposition.json`、`-type-only-fix.json`

下一步值得优先核查一个具体的联机控制路径：`beginSync` 与真正断线都发送 `presence(false)`，Worker 删除 externallyControlledShipIds；启动/恢复期间可能把仍连接但尚未确认快照的真人舰交给 AI，额外增加重型舰火控扫描，并改变临时驾驶行为。简化 Worker 驱动在 start 前标记真人在线，而生产路径先同步、再在线。需要记录实际 presence/控制权/帧耗时验证这一区别，不能仅凭静态代码就声称它解释了所有过载。本轮没有改该协议或接管行为。

总目标继续 active。百舰真实模拟预算、真实跨机与长时联机仍未完成。
