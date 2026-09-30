# 接收/渲染 Worker：实现前证据与边界（2026-09-25）

## 依据与完整目标
前两轮接收校验小循环实验无实际收益。当前LanBattle.tsx的RAF同时执行完整快照恢复、预测、WebGL渲染和HUD更新；目标是让接收恢复和渲染共享一个Worker内的显示世界，仅让输入/React HUD留在主线程，避免把完整对象图复制回来。此轮先实现并验证原渲染器可在Worker中处理真实二进制LAN快照和OffscreenCanvas；不以资源适配/无头测试通过冒充完整默认联机迁移。

已读当前TextureCache、WebGLTextureManager、WebGLCombatRenderer、ShipDamageVisuals、ShipOverloadRenderer、HulkSpriteMask。阻碍是DOM Image、DOM辅助Canvas及对应TS类型，不是WebGL着色器/批次接口。GraphicsSettings对无localStorage环境已有异常保护，但未来Worker必须显式同步用户设置。Contacts/HUD/Radar仍直接读world，输入/预测/摄像机/暂停/重连的职责迁移尚待完成，当前不更改LanBattle默认入口。

## 原版证据与不变规则
原版0.98a-RC8。本轮重新读取decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/OOoO.java:160–168（整数热光G/B/alpha）、String.java:169–188（alpha!=0与stencil mask）。保留现有Web颜色乘法/掩码/旋转/纹理尺寸/混合/通道顺序及实际资源，不减少伤痕、粒子、数据或频率。没有原版桌面实机补验；新旧Web像素对比不是原版视觉等价证明。

## 实现切片
- RenderSurface统一HTMLCanvas/OffscreenCanvas创建和context获取，DOM路径仍创建原HTMLCanvas，不全局换后端。
- TextureCache保留现有getImage/waitForImage DOM接口和事件时序，增加可用于Worker的实际ImageBitmap资源读取/就绪订阅；只有无Image的Worker走fetch+createImageBitmap，处理失败、取消与dispose，Bitmap必须正确释放。
- WebGL/伤痕/残骸/过载渲染读取实际CanvasImageSource，不伪造document/Image对象，不复制整幅显示对象图。ImageBitmap premultiply/orientation需要用真实完整WebGL像素证据核对，不能假定默认等价。
- 可复用LAN presentation runtime按现有decoder和LanDisplayWorld验证/恢复，在同一线程内直接交给原WebGL renderer；网络数据仅跨边界一次。默认联机暂不接入，先证明完整图像、数据校验、资源生命周期以及主线程忙时Worker确实推进。

## 验证
冻结修改前650个非生涯源文件；扩展既有check-battle-batching-browser的可选Worker场景，并保留原测试模式。真实二进制显示快照覆盖正常战斗、伤痕/过载/碎片及不同摄像机；对照冻结旧DOM/current DOM/current Worker像素，采集恢复+绘制耗时与资源情况。像素读回仅为测试，不放入生产跨线程返回。有限的无头主线程阻塞探针用共享进度计数验证Worker独立，不注入输入事件，不称作input-to-photon或WAN性能。

完整实现后集中typecheck、改动文件lint和此既有浏览器场景，遇具体失败才定向修复；不运行全套生涯/发布测试。不启用默认Worker、不减少效果、不操作桌面、不启动子代理、不提交/打包/发布。

## 实现后的具体发现
- 单一 `ImageBitmap(premultiplyAlpha: none)` 不能同时替代 HTMLImage 的两种用途。普通 WebGL 战斗像素一致，但第一次损伤场景差 34,922 个通道值，放大场景差 127,085 个通道值；定向读取中间画布确认差异来自伤痕 base 和残骸 hull，不是 glow/过载或 RNG。
- 保留每张资源同一 Blob 的两份原生解码：straight alpha 用于 WebGL，premultiplied alpha 用于 Canvas2D。没有改混合公式、取整、伤痕、掩码或像素验收容差。双份 bitmap 一起就绪、一起关闭；旧 generation 的迟到解码不能污染新加载。
- DOM 路径继续返回 HTMLImageElement / HTMLCanvasElement；就绪订阅是一次性的，取消也抑制已排队的回调。Worker 退出显式关闭 bitmap，不清空 DOM 持久图片缓存。
- 增加实际 transferControlToOffscreen 的无头测试，Worker 内接收二进制 ArrayBuffer、既有 decoder/restore、既有 renderer；常规回包仅为小型指标。readPixels 只用于测试且在计时窗外。
- 原既有 battle batching 场景使用了早已迁走的 CombatSnapshot.captureCombat 导出，默认场景首次执行因此失败；只修正为 AuthorityCombatSnapshot 的实际导出，原断言/夹具/输出结构保留。
- GPU context loss/restore 的验证在原生 loss 事件结束后的下一任务恢复，避免在事件微任务期间过早请求恢复。验证真实 context 与纹理重建，不伪造事件。

结果、内存代价、性能边界和未接入项见 offscreen-presentation-validation-2026-09-25.md。
