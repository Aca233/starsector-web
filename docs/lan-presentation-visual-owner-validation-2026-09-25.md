# 弹丸视觉 owner 与渲染一致性验收（2026-09-25）

## 交付

补上生产呈现 Worker 的 `projectile-visual` 接收通路。真实 `LanConnection` 沿用既有有界分片组装与消费账本；完成组装的独占 ArrayBuffer 通过 transfer 移交 Worker，`LanPresentationRuntime.receiveVisual` 使用既有完整 anchored codec、CRC 和 ProjectileVisualReplica。恢复的弹丸图不回传主线程。

最终 baseline-ready 只能由真实 Worker 保留结果完成本地回执；之前的 fragment ACK 只是片段消费，不会授予 baseline-ready。会话、sync、能力、隐藏/加载门槛和失败 owner 均保留检查。地图打开、失焦或输入被遮挡不误停视觉接收。坏 visual 原子丢弃，不错误销毁仍有效世界/anchor。重置 owner 同时清空未完成的组装，迟到的旧 state/visual 完成不能向新会话授信。

新增共享 `LanPresentationDefaults.ts`，实际 LanBattle 和 Worker 共用原页面的 identification 层与 WebGL 属性：alpha=false、antialias=true、powerPreference=high-performance。不是减效果换性能。Worker 创建及 bounded controls 发送时显式镜像当前规范化图形偏好；此次测试镜像 screenShake，不改变用户实际页面的设置或默认质量。

**边界：** 默认 LanBattle 尚未改为 Worker 绘制；页面仅提取原值完全相同的层/上下文常量。本轮是完整页面迁移的必要缺口修复，不能称为已实现整页迁移或已经降低输入延迟。base64/分片组装仍在主线程，直接 socket→呈现路由、实时 camera/aim 小标量通路、本地主机/JSON 回退与完整页面生命周期仍未完成。不能用 100ms HUD 采样替代实时输入相机。

## 源码与静态检查

- before 冻结 670 个非生涯生产模块，after 672；新增 Defaults、Visuals 两个模块，改动六个既有网络/呈现模块，其余 664 个 hash 不变；无删除、无磁盘漂移或越界修改。
- 六个改动文件：protocol.ts、LanPresentationRuntime.ts、LanPresentationWorkerClient.ts、LanPresentationWorkerProtocol.ts、lan-presentation.worker.ts、LanBattle.tsx。既有 UI、传输、预测、解码和生涯 WIP 保留。
- 本轮 LanBattle 对照只移出层常量与 WebGL 属性，未开启新模式、未改变图像参数。独立保存修改前文件，可审查当前任务差异，而非把所有历史未提交修改算成本轮。
- 最终冻结 CompilerHost 对照：before 0、after 0、新增诊断 0。scoped oxlint、改动文件尾部空白检查通过。不是整个工作区功能完整性声明。
- 无提交、暂存、推送、打包、发布或已安装游戏内容修改；版本仍为 0.2.11。

## 既有场景结果：17 组通过

复用 check-battle-batching-browser 的 OFFSCREEN_TRANSPORT_CHECK 分支、真实生产 Worker/客户端、真实 LanConnection/socket I/O 和回环 fixture peer。Chromium 无头 / RTX 5060 / ANGLE D3D11；不是外网、真实房间服务器或 FPS/端到端延迟基准。

除上一块的状态/运动/关键战斗、终局屏障、UI/输入命令、控制合并、异常与释放测试外，新验证：

1. **画质配置一致**：读取 Worker 实际 WebGLContextAttributes，核实 alpha、antialias、powerPreference；实际层包含 identification 而非错误的 markers；创建和后续 controls 的图形偏好均到达 Worker。
2. **真实分片基线**：22 舰场景 tick600 有 173 枚弹丸，基线 20191 字节。三个片段先返回 fragment，offset 为 0、6144、12288；最后 offset18432 的完整基线留有未完成消费债务，扣住 Worker 完成消息期间无 consumed ACK。放行后才确认完整基线。
3. **移交而非克隆**：在实际 receiveVisual 调用后检查来源 ArrayBuffer 已 detached；只有完成组装的 20191 字节被投递一次，默认订阅者不收到重复恢复图。
4. **完整动态实体**：tick601/602/603 的真实更新分别保留 175/174/175 枚弹丸。地图打开/失焦仍接收；坏 CRC 的 tick602 discarded 后，有效同 tick 更新能继续使用未损坏 anchor。
5. **隐藏与恢复**：隐藏期间 tick603 discarded，没有推进视觉状态；恢复后同一有效更新可以 consumed。
6. **独立渲染层真的接通**：基线 consumed 以后，使用生产 withoutBulkProjectiles 生成 tick601、602 的 projectileVisuals=1 快照。检查实际已应用 tick602，world.projectiles.length=0，而实际 renderView().projectileVisuals 仍包含 tick603 的完整 175 枚弹丸。这样排除“完整快照原本就有弹丸，掩盖漏接”的假阳性。此为真实渲染输入/状态证明，**不是逐像素或屏幕外观等价证明**。
7. **切局/低基线**：新会话清除视觉历史；低于 minTick 的基线仅作解码依赖，不能成为显示 tick 的同步证据；随后合格 update 可被还原。已经发回但扣住的旧 visual 完成不能为新 epoch 归还额度。
8. **默认路径保留**：另用没有 binary owner 的真实连接接收相同基线/更新，原订阅路径经真实 ProjectileVisualReplica 保留，到 tick602 为 174 枚弹丸，消费回执正常排空。
9. **终态保护覆盖 visual**：失败客户端的 receiveVisual 不能用 stale/discarded 误发 ACK；显式释放可清掉网络 claim。

最终正常路径 workerErrors/networkErrors/browser errors 均空；生产 Worker dispose 返回 residentTextures=0、pendingUploads=0。坏 motion 测试依然是刻意注入的独立失败。没有重复声明上一块的 Bitmap 私有内省为新生产入口的证明。

## 验证节奏与具体修正

首次场景在控制有界性检查失败：新增视觉准备步骤还有一份 controls 在途，而原测试立刻进入“扣住第一份”的假设。修正为先等准备步骤的配置排空，不放宽在途/最新两份上限；第二次通过。随后审查发现“完整快照仍带弹丸”可能掩盖视觉层未接入，增加实际 bulk-omitted/renderView 断言与小型诊断计数，再定向静态检查和同场景复查，通过后未继续重复运行。未扩展到无关全套、原版实机、可见窗口或键鼠操作。

## 工件与复现

`artifacts/lan-presentation-visual-owner-20260925/` 保存 before/current 冻结图、typecheck-comparison.json、lint.log、source-changes.json、acceptance.json、失败日志与最终 offscreen/offscreen-result.json。

沿用既有 Node/Playwright 环境，设置 OFFSCREEN_RECEIVER_CHECK=true、OFFSCREEN_TRANSPORT_CHECK=true、VITE_LAN_LAYERED_SYNC=true、VITE_LAN_CRITICAL_COMBAT=true、MULTIPLAYER_ANGLE=d3d11；OFFSCREEN_BASELINE/OFFSCREEN_CURRENT 指向本目录冻结图绝对路径，BATCH_TEST_OUT 指向本目录 offscreen，运行 `node scripts/check-battle-batching-browser.mjs`。清除其它 Offscreen 检查开关，不需要打包或启动可见窗口。

原版来源、迁移前发现的问题和下一块边界见同日期 source-notes。整体“继续优化”目标仍未完成，没有实际模拟速度或输入 p95/p99 提升数值。
