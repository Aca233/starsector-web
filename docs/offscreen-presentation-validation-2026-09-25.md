# LAN 接收/渲染 Worker：实测结果与未完成边界（2026-09-25）

## 结论
本轮落实了真实的后台接收恢复 + WebGL 绘制能力，**不是已经启用的联机加速开关**。默认 `LanBattle.tsx` 未改，仍走原路径；新 `LanPresentationRuntime` 是可复用的同线程显示世界/渲染拥有者。不能宣称玩家已获得较低 RTT、input-to-photon、较高权威模拟 Hz，或实现了 GPU compute。

已证明：不把恢复后的整幅对象图传回主线程，也不削减画面，可以将既有接收和 GPU 提交移到 Worker；主线程忙时 Worker 能继续工作。下一步必须连接真实网络/播放/预测/输入/摄像机/HUD/音频/暂停/重连，再测联机端到端延迟。

## 变更与视觉问题解决
- `RenderSurface` 使用真实 HTMLCanvas/OffscreenCanvas、HTMLImage/ImageBitmap，不注入伪 document/Image。
- `TextureCache` 保留 DOM API，Worker 使用 fetch + 原生 bitmap 解码；WebGL 直通 Alpha 与 Canvas2D 预乘 Alpha 分开缓存。单份直通解码曾造成严重伤痕/残骸差异，已用中间画布读回定位并修复，不放宽像素标准。
- 原 GPU sampler、绘制顺序、混合、纹理尺寸、热光取整、伤痕数量、掩码与资源保持不变。
- `LanPresentationRuntime` 调用原 `createLanDisplayWorld` / `applyLanDisplaySnapshots` 和 WebGL renderer；恢复出错后禁止继续使用，可重复 dispose。既有数据安全检查没有绕过。
- 生产改动相对实验前冻结图只有8个既有渲染模块和2个新模块；清单/哈希在 `artifacts/offscreen-presentation-20260925/source-changes.json`。没有改动权威模拟或默认联机入口。

## 验证方法与结果
扩展原 `scripts/check-battle-batching-browser.mjs` 的可选 `OFFSCREEN_RECEIVER_CHECK=true` 模式，未新建测试工程。所有测试是独立 headless Chromium，无桌面/键鼠操作、无 multiplayer 输入事件夹具。

冻结650个修改前非生涯模块，SHA256 `4561f7768914d688b4ccd652be5097b81e9c85a5b40ce08d61d84cbf89cbed27`。三条路径使用同一组实际捕获并编码的二进制数据：冻结旧 DOM、当前 DOM、当前 Worker；初始数据331,368字节，末帧443,663字节。Worker 使用实际 `transferControlToOffscreen` 和 ArrayBuffer transfer，检查发送后缓冲区脱离。

- 22艘真实舰船：5 Onslaught +17 Hammerhead，seed917，权威引擎先推进600 tick。
- 4组正常战斗（初帧173弹体）+8组伤痕/过载/残骸/火花场景；1320伤痕，不同相机、0.35–2倍缩放，包括视野外场景。
- RTX5060 / ANGLE D3D11：12组当前 DOM 和12组 Worker，逐通道像素均与冻结旧 DOM完全一致（0差异）。
- SwiftShader：同样12组×2条候选路径，全部0差异。不同后端之间不要求像素相同，只比较各后端自己的冻结基准。
- 主线程故意不让出200ms：两种后端的 Worker 都在这段时间内完成12次二进制解码、恢复和实际绘制。使用跨源隔离和共享计数器在阻塞期间观察，不依赖事后消息抵达冒充进度。
- Worker HTTP失败、已排队回调取消、pending fetch终止、双 bitmap关闭、同URL新旧generation竞态、dispose/invalidate后的迟到GPU上传均通过。
- D3D11另验证 DOM图片加载/失败回调恰好一次、取消排队回调、bitmap清理不影响DOM图片/染色缓存，以及DOM迟到上传拦截。
- 两种后端均验证真实 WebGL context丢失→恢复→纹理重建，恢复后普通画面再次与旧/新DOM像素一致；最终D3D11还验证受损画面恢复前后完整像素一致。
- 非法displayVersion被原恢复器拒绝，runtime随后禁止绘制；dispose后禁止apply/draw。最终D3D11关闭234个bitmap、GPU residentTextures=0、pendingUploads=0。
- 默认既有battle batching场景通过：22舰、173弹体、像素0差异、权威状态不变，1/4 texture slots分别203/102 draw calls。不是本轮的新优化收益。
- 最终 `npm.cmd run typecheck`、改动文件 oxlint 1.82.0（退出0）通过。

## 工作耗时：不要误读为“单帧加速”
每条路径24次预热、48次计量，按整轮反向轮换路径顺序，包含 `gl.finish`，固定权威数据与视觉时间。不包含真实网络和React/HUD，也不是RAF吞吐率。主线程做传输切片、调度及回执的成本没有因Worker内计时而消失。

D3D11最终结果（毫秒）：

| 路径 | 总工作均值 | P50 | P95 |
| --- | ---: | ---: | ---: |
| 冻结旧DOM | 9.500 | 9.370 | 11.095 |
| 当前DOM | 8.987 | 9.060 | 10.610 |
| Worker内部 | 9.586 | 9.375 | 11.585 |

Worker消息发送到回执 P50=10.390ms、P95=12.760ms，仅为本地无头测试往返。Worker没有显著缩短同一份工作的总耗时；当前DOM和旧DOM的差值也不足以归因于算法优化。真正已验证的收益是隔离主线程竞争的能力。

SwiftShader的Worker内部P50=14.200ms、P95=18.865ms（旧DOM12.800/16.530ms），更说明不能无条件把“换Worker”当成总吞吐提升。

## 资源代价
这组资源连同生命周期测试用图共234个原生bitmap（两种Alpha表示），按RGBA尺寸估算48,471,832字节，约46.23MiB；其中额外的第二份约23.11MiB。这不是浏览器进程/显存总占用：不包括GPU纹理、辅助Canvas、编解码缓存和引擎内存。DOM路径没有这份双bitmap成本。未来可按真实Canvas资源闭包收窄第二份，但不能合并Alpha表示、改变颜色或用较低精度换取通过。

## 证据文件
基目录：`artifacts/offscreen-presentation-20260925/`
- `accepted-d3d11/offscreen-result.json`：最终扩展场景，完整样本和断言。
- `accepted-d3d11/worker-canvas.png`：实际转移后DOM宿主canvas的截图，已目视查看，不是空画布。
- `swiftshader/offscreen-result.json`：第二后端同一生产代码验证；不含后续追加的DOM生命周期和受损画面恢复断言。
- `default-battle/result.json`：默认既有场景。
- `d3d11/offscreen-result.json` / `diagnostic/canvas-diagnostics.json`：最初失败及差异定位，不删除失败证据。
- `premultiply/offscreen-result.json`：双Alpha表示修复后第一轮通过。

## 明确未完成
没有生产Worker传输协议/调度入口；测试Worker在scripts目录，不伪装成可用的联机功能。需要连接并验证：
1. 真实LAN收包、帧队列、背压、暂停/断线/重连/销毁顺序；
2. 运动/炮塔预测、摄像机、输入命令与ACK时间线；
3. 有界HUD/雷达/联系人投影、音频事件，不复制完整显示对象图；
4. 用户图形设置、图层、尺寸/DPR/可见性与Worker同步及不支持时回退；
5. 真实联机端到端延迟、主线程长任务、稳定吞吐和内存门槛。

原版0.98a-RC8源码依据见source-notes。没有原版桌面实机补验；Web新旧像素一致不等于已证明原版视觉完全等价。未暂存、提交、推送、打包或发布。

## 后续状态
随后一轮已将LanBattle内部端点/姿态/效果处理抽为生产共用流水线，详见lan-presentation-pipeline-validation-2026-09-25.md。本文件的“LanBattle未改”指本文件记录的基础Offscreen阶段；最新默认渲染线程仍为主线程，但内部代码已与Worker runtime共用。
