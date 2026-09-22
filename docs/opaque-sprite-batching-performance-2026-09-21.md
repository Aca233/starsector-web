# 不透明战斗画面混合合批实验（2026-09-21）

## 编码前来源对照

- 原版 0.98a-RC8：`../decompiled/starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:759-761`、`entities/ContrailParticle.java:37-39` 使用 SRC_ALPHA / ONE_MINUS_SRC_ALPHA（普通）以及 SRC_ALPHA / ONE（加法）。Web 两种混合保持相同绘制顺序和 RGB 合成公式。
- 当前 Web `SpriteBatcher` 在纹理/普通与加法切换时强制提交。候选让每实例携带混合模式，统一使用预乘颜色与 ONE / ONE_MINUS_SRC_ALPHA：普通输出 `(rgb*a,a)`，加法输出 `(rgb*a,0)`。先 clamp 原片元，保留 RGBA8 超范围输入的钳制。
- **仅供不透明输出**：主战斗 canvas `alpha:false`，降分辨率 present shader 固定输出 alpha=1；不透明画面不使用累计 framebuffer alpha。新模式不承诺 framebuffer alpha 与旧模式相同，默认 SpriteBatcher API 仍走旧模式，不能用于透明截图/中间遮罩。
- 保留所有实例、UV、纹理/通道/透明覆盖顺序与模拟频率；不重排为先普通后加法。实例 16-float 填充位同时存纹理槽与混合位，不增加上传步长。
- 验证：真实 WebGL 混合交替/纹理溢出/容量/高亮与透明输入/外部程序恢复；完整战斗前后配对；像素差异定量、上下文恢复与资源释放。不因 draw call 减少就声称实际帧率提升。
- 原版 UI/实机：没有新操作桌面，本次只调整内部合成，不改变布局和交互，原版实机未补验。

## 本轮状态：设计草案，未应用/未验证

准备写入前的内容一致性断言发现 `SpriteBatcher.ts` 已被其他任务新增流式上传实现（第三构造参数 streamUploads）。断言在任何本实验源码写入前终止，未覆盖或撤回该改动。本文件仅保留后续混合合批的设计边界，**不表示实现完成、画面等价或性能已有收益**；源代码、性能表均不计入本轮交付。
