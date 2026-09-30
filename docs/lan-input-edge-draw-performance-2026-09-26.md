# 输入边沿额外绘制：未达门槛，已撤回（2026-09-26）

## 决定

已精确恢复三个生产文件，呈现Worker仍默认关闭，发送准入、飞行按键保留修复与全部既有优化保持不变。未暂存/提交/推送/打包/发布。本轮没有新保留的生产提速，整体优化目标未完成。

这是不同于receipt-input-tail的新候选：keys/firing边沿请求已有有界Worker唤醒；若最近已提交帧未采样该状态，则额外调用同一完整frame流水线。不更改网络输入预算或权威模拟。最多一条controls-wake在途和一个最新待唤醒位，seq/指针变化不单独增加额外绘制，原rAF链不删不倍增，准备/世代/同步/隐藏/上下文/权限检查照常执行。

## 验证经过

1. 完整typecheck和改动lint exit0。
2. 既有无头真实WebGL/离屏FrameLoop场景通过：12种combat/damage状态loop与手动完整流水线像素相同；异步资源准备、失效/重入/隐藏/stop/reset/dispose检查通过。新增输入帧检查证明：准备中不画、一次额外帧保留一条rAF、禁止重入、旧rAF时间戳不倒退/不重复计dt、隐藏/上下文丢失/stop/dispose不即时绘制。实际Worker在主线程250ms忙任务中继续rAF，恢复/重连时钟与资源释放通过。
   - OFFSCREEN_LOOP_CHECK分支提前返回，因此同次环境虽配置TRANSPORT/CONTROLS标志，**不能声称同次还跑了它们**。真实生产Worker的有界邮箱及输入场景由后面的联机测试验证。
3. 首次性能组before在进入计时前出现真实主机过载/恢复失败，HUD许可等待超时；原数据保留。随后单独startup-recheck从before重新开始，沿用原源码图、52份raw CSS、三个编译CSS入口与所有数值门槛，不混入失败臂。
4. 重查before通过完整双端、主机800ms停顿、访客ACK推进、主机同局重连、原子邮箱/扣真实控制ACK/隐藏恢复/访客重连及资源释放。
5. 重查after完成计时、800ms停顿和主机同局重连，但在扣控制ACK后的夹具断言失败：旧合同要求keys更新不产生queuedControls；本候选有意新增一个最新待唤醒位，因此返回true。该时刻controlsSent没有继续增加，held回执仍只有一份；不能以此宣称全部正确性已通过，也不能说发生了无界消息排队。
6. 即使适配这一有意改变的测试合同，也不能挽救已失败的性能门槛。因此停止后续臂，不修改断言后重跑择优，归档并回退候选。

## 首组观察值，不是完成的ABBA结论

原计划before/after/after/before，实际只完成前两臂计时；第二臂后置检查失败。没有算两对等权总收益、没有pool样本、没有执行剩余两臂。

22舰（2玩家20AI）、seed917、1280×720、D3D11、shared呈现，各20秒（普通10+合成主线程70ms忙任务10）；每阶段40个DOM输入，WebGL提交不是显示扫描。无CPU/时间线/准入诊断探针；原owner-local采样两臂一致。

| 指标 | before | after | 变化 |
|---|---:|---:|---:|
| 普通控制采样→提交P95 | 23.095ms | 17.325ms | −24.984% |
| 忙时控制采样→提交P95 | 19.260ms | 14.765ms | −23.339% |
| 普通累计ACK覆盖后draw P95 | 107.815ms | 115.490ms | **+7.675ms** |
| 忙时累计ACK覆盖后draw P95 | 176.940ms | 140.875ms | −36.065ms |
| 普通提交帧数/10秒 | 598 | 644 | +7.692% |
| 忙时提交帧数/10秒 | 600 | 639 | +6.500% |
| 各阶段成功发送/输入数 | 40/40 | 40/40 | 无新增发送缺失 |

普通控制改善须至少25%，实际24.984%不能四舍五入成通过。更关键的是普通ACK覆盖后draw回归7.675ms，超过预写3ms上限，已足以拒绝。额外帧数满足1.3倍预算，但帧数增长不是CPU/GPU占用增长的精确测量，更不是模拟吞吐提升。累计ACK覆盖不能证明被替代输入各自运行过一个模拟tick。

## 意义与下一步约束

增加少量绘制工作确实在本组改善了控制采样的局部响应，但没有同时满足完整交互链路门槛。不能默认启用、不能当作利用GPU计算加速的成果。至于普通ACK尾部回归是否由额外绘制挤占收包/恢复时机造成，本轮没有足够因果证据，不能直接下结论。

若继续探索事件驱动呈现，需要真正不同的工作安排，避免每次边沿都重走完整快照应用；必须证明原常规帧仍按时处理全部权威端点、离散效果与确认，不降低更新频率/精度或隐瞒旧画面。或者从此前测出的恢复大任务做结构性改进。不要复活已否决的标量validator/guard重排、receipt-input-tail或本轮完整额外frame候选。

## 精确回退与保留的工具修复

- LanPresentationFrameLoop.ts、LanPresentationWorkerClient.ts、lan-presentation.worker.ts均按本轮修改前字节恢复，并通过当前候选hash检查防止覆盖并行修改。
- 候选专用renderInput生命周期测试随同撤回，完整候选及测试字节保存于rejected-candidate-files.json。
- 保留旧FrameLoop夹具的实际完成通知适配：先断言applyMs/renderMs/gapMs/playbackDelay合法，再比较确定性控制输出，避免新遥测字段让原deep equality必然失败；未忽略实际输出。
- 保留早期启动失败时的清理修正：尚未安装controlClient探针就不执行该探针释放断言，原始启动失败仍保留exit1，不伪造成功。
- 回退工具lint与TS转换通过；没有再次跑完整类型检查/无意义的性能轮次。所有进程已结束，没有未验收生产候选残留。

## 工件

C:/Program Files (x86)/Starsector/starsector-web/artifacts/lan-input-edge-draw-20260926/

- decision.json、rollback-verification.json、rejected-candidate-files.json。
- offscreen-contracts/offscreen-result.json、typecheck.log、lint.log。
- 首次启动失败的1-before完整记录。
- startup-recheck/protocol.json、performance.json、measurement-manifest.json、1-before/与2-after/的真实场景/输入/邮箱记录。
- before-browser.json、after-browser.json、frozen-battle.css与before/精确生产备份。
