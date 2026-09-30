# 主线程忙任务结束到绘制提交：时间线诊断（2026-09-26）

## 范围与已有证据

上轮 receipt-input-tail 已按预写门槛撤回：第二对忙时控制采样到提交 P95 回归 7.335ms（上限3ms）。该组 keydown 处理约0.02–0.10ms，合成忙任务约70ms；尾部12–16ms，对照约5–6ms。不能据此归因GPU、GC、线程底层或帧内解码。

本轮只修改无头测试工具，不改生产、玩法、原版界面、默认Worker、输入预算或画质。无需修改原版机制；沿用飞行边沿 source-notes 的原版控制依据，原版实机仍未验收。源码锚点：LanBattle.frame（rAF回调→viewport→applyPlayback→renderPose→follow→drawPlayback→HUD）；protocol.ts 的 socket.onmessage 接收处理。

## 最小诊断

1. 新显式 MULTIPLAYER_POST_BLOCK_TIMELINE=true，仅允许 main 呈现且有输入测量窗口。测试Vite变换，默认不注入；访客本地有界数组记录回调实际进入、rAF参数时间及各阶段边界、回调结束，记录真实socket.onmessage同步跨度。无逐帧IPC。
2. 同步收集 Chromium trace（非CPU采样、无截图），只解释窗口中其它任务/GC/布局与空白，不能把没有可见trace事件等同CPU空闲或GPU完成。
3. 固定两臂 current / archived-rejected，仅原因诊断。冻结当前JS/JSON、同一完整CSS；归档候选只在隔离冻结图中覆盖三个已撤回文件，不写回生产。不修改上一轮门槛、不把带探针数值拿来补发性能通过。
4. 保留全部输入、缺失与异常。对每个忙窗口第一份采样对应key的真实draw，分解 busyEnd→callbackStart 与 callbackStart→submit；这些是同一输入的可加跨度，不相减不同样本的P95。进一步列viewport/apply+sync/pose/follow/draw及主线程任务重叠。
5. 集中工具lint、测量合同和相关真实双端场景；无需对未改生产重跑全项目typecheck。保留主机停顿/同局重连/清理断言。trace/插桩有扰动，只作为原因线索，不能证明原无探针运行必然同因。

## 验收与后续

时间戳必须单调、选中draw必须落在唯一回调里，阶段和总和一致；未匹配不能伪造零。若新增尾延迟主要在回调前，则优先排查任务排队/调度而非改渲染算法；若在回调内，再针对实测最大阶段提出不同候选。诊断自身不能算生产提速。

## 启动失败及隔离修正

首轮最新源码在加载 LanBattle 前失败：其它UI工作中的 AuthenticTacticalConsole 引入了尚不存在的 combat-interface.css，没有进入计时，不产生任何性能结论。保留原日志/result且不修补其它任务文件。

定向 recheck 改用上轮有效四臂的原始冻结JS/JSON与原三个编译CSS字节，用于诊断该已撤回候选；三个生产文件与保留的飞行边沿修复SHA均未变化。另外核实：旧冻结工具只覆盖三个入口编译CSS，而JS仍会导入附属CSS，不能把旧结果描述成“所有样式均已冻结”。此次把当前所有附属CSS原字节也放入冻结图，由现有冻结Vite load读取，保留CSS模块原导入次序，两臂完全相同；没有Tailwind实时扫描。附属CSS不是上轮运行时的历史字节，因此只为新诊断组内隔离，不能证明原帧尾变化的唯一原因。

## 根据实测继续定位（单臂，不重跑已否决候选）

两臂有效诊断各40个忙窗口全部匹配：回调前等待P95为2.880/2.686ms；回调内工作P95为5.051/11.678ms。慢样本的apply阶段5.1–9.8ms，该阶段没有已记录主线程GC事件重叠。这一证据改变下一动作：仅在保留策略单臂上加LanDisplaySnapshot分段探针（validate/definitions/specs/identity/records/links/world/read/wings/deployment/targets），并使用既有CPU profiler辅助查调用栈。

不使用已撤回策略、不比较带不同探针运行的速度、不宣称已锁定原无探针回归根因。沿用此次已隔离源码+所有样式，20秒真实双端场景。此次针对LAN DisplaySnapshot，不能套用此前单机Host CombatPresentationDecoder的Entry分配/可达图统计；二者不是同一解码器。
