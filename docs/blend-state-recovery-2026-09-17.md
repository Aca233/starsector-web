# WebGL 上下文恢复混合状态修复（2026-09-17）

## 结论

保留正确性修复，但本轮没有证据证明新增显著性能提升。100 艘战列舰 / 180 FPS 目标未达到。

## 根因与修改

新建/恢复 WebGL 上下文的 blendFunc 为 ONE/ZERO；SpriteBatcher 的逻辑缓存已经是 NORMAL，begin() 的 setBlendMode('NORMAL') 提前返回，导致恢复首帧出现不透明方块云层与小行星边缘。begin() 现在无条件拥有实际 NORMAL 混合状态。WebGLCombatRenderer 仅删除 effectBatcher.begin() 后立即重复的 resumeProgram()；其他跨批次恢复仍保留。

生产修改只涉及 src/engine/render/webgl/SpriteBatcher.ts 和 WebGLCombatRenderer.ts。没有改变模拟算法、画质、分辨率、特效数或 AI 频率。之前保留的 Vector2 构造优化仍在。

## 验证

- 20 组基础图元状态组合通过：1/4 纹理槽、NORMAL/ADDITIVE 缓存、默认/正常/加法/分离混合/关闭混合。候选与显式正确状态参考像素一致，绘制数不变、GL 错误为零。
- 真实生产场景 WEBGL_lose_context 恢复首帧：非 MSAA 从 148469 个通道不同（最大差 254）修复至 0；首次云层混合因子从 [1,0,1,0] 修复为 [770,771,770,771]。
- MSAA 修复后仍有 112 通道稀疏差异（最大差 21），未变参考之间也有 253 通道差异（最大差 45）。这不是严格 MSAA 像素一致，也不撤销上一轮 FX 合批的 MSAA 例外。
- 当前源码与 290 文件候选快照一致；相对冻结基线仅上述两文件不同。typecheck、lint、build、当前生产冒烟、上下文资源重建与销毁均通过。dist 已更新。已有大 chunk 警告仍存在。

## 配对性能（不是 FPS）

Chromium ANGLE D3D11 / RTX 5060，2560×1440 DPR1，固定 1/60，360 步/60 预热；前后页面按步交替，重型工作没有并行。完整周期包含模拟、视觉更新、绘制与 gl.finish。

| 场景 | 完整周期均值：前 → 后，ms |
| --- | ---: |
| 密集100 | 166.247 → 166.725 |
| 常规10 | 9.819 → 9.309 |
| 常规50 | 48.477 → 48.040 |
| 常规100 | 118.097 → 118.231 |

每场仅一组配对；小幅混合结果不足以确立加速，模拟代码未改仍有波动。全部最终状态指纹、存活数一致，页面/GL 错误为零。本轮无新增真实 rAF 验收。修复保留的理由是画面正确性，不是把毫秒换算为 FPS 的宣传。

## 下一步

当前冻结候选 CPU 采样仍将威胁预测、近炸与射击遮挡列为热点。单个主调用节点：assessThreats inclusive 8781ms；checkProximityFuse 5055ms（其中 distanceTo 1160ms）；shotObstruction 3416ms。采样受 profiler 干扰，不参与前后加速比计算。继续优先削减全量候选遍历，而不是降低画质或反复微调 GL 状态。

证据保存在 artifacts/blend-state-recovery/，包括 decision.json、冻结源码和构建、原始配对行数据、CPU profile、首帧截图及全部验证日志。
