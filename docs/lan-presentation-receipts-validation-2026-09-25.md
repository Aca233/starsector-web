# LAN 呈现消费回执：接入与验收（2026-09-25）

## 结论
**实际 LanConnection / LanBattle 已接入显式、有界的呈现消费回执。生产呈现仍在主线程，完整 presentation Worker 迁移尚未完成。** 本轮修正的是异步处理前必须成立的所有权、信用释放和生命周期合同，没有测得或宣称新的模拟/FPS/输入延迟收益。

原版依据、实现前预期及实例隔离反例，见 `lan-presentation-receipts-source-notes-2026-09-25.md`。不改变 tick、精度、实体、效果或战斗结果；没有占用桌面、启动可见窗口或注入键鼠，也未进行原版实机补验。

## 正式路径改动
- 新增 `src/network/PresentationReceipts.ts`：state / visual 独立账本。异步消费者必须在同步订阅回调返回前 `defer(cancel)`，真正保留/丢弃后再 `complete`；postMessage 成功不代表消费完成。
- 服务端 state ACK 会累计释放更早帧，故后一帧先完成也不能越过未完成的前帧；visual 独立释放，避免互相阻塞。正常同步消费且本地发送成功时，不添加 timer 或微任务等待。
- token 使用本地 owner/epoch/id，对应已有小型 ACK 信息。Worker 不能自行选择要确认的服务端 seq。完成后的重复回包、旧代际和其他实例 token 均被拒绝。
- state 上限 64 项和 `maxSnapshotBytes × 2` 编码单位；visual 上限 4 项和 `baselineBytes × 4` 编码单位。二进制按字节计、JSON 按字符串 code units 计，**这不是解码后堆内存占用上限**。账本不保留帧内容；消费者自身仍负责所保留的数据及取消时释放。
- 本地 ACK 发送失败暂存并以 50ms 重试，入账后最多等待 5 秒；超量、异常、超时走失败/撤销，不提前授予信用。重连、新 launch、可见性变化、离开/关闭撤销旧代际。取消异常计数，不能阻断整体清理；visual fallback 只丢弃 visual，不清掉 full-state 信用。
- `ended` 在已接收任务实际完成后发布；只允许一个终局回调，同键重发合并，新代际撤销。不为已保留内容尚未发出的 ACK 额外阻挡结束。
- `protocol.ts` 不再信任消息上可变的 `visualHandled`；`LanBattle.tsx` 在 runtime 真正接收后报告 consumed/discarded。停止/冻结明确撤销。片段仍沿用 assembler/fragment receipt，片段回执不能授予 baseline-ready。

## 集中静态与合同验收
初次 typecheck / 改动文件 lint / 9 项定向测试通过，首次双端 LAN 亦通过。随后复核发现跨实例 token 碰撞的具体问题，补第 10 项反例，并先复现失败，再修复；只针对这项修复复查最终源码与相关联机路径，没有运行全套测试。

最终结果：
- `npm run typecheck` 通过；改动文件 scoped lint 通过。
- `node --test --test-name-pattern='presentation receipt:' scripts/check-background-heartbeat.mjs`：**10/10 通过**。
- 改动 tracked 文件 `git diff --check` 通过；仅有工作区既有 CRLF 提示。

10 项覆盖：
1. 同步保留后回执，等待所有同步订阅者返回，不添加 timer。
2. 乱序完成不能累计释放未完成前帧（使用实际 LanStateCredits）。
3. 重连/新 launch/可见性/退出失效、同 launch 不重置、取消仅一次及重入安全。
4. 订阅者完成后再抛异常、返回 Promise 的误用、reject 均不授予信用。
5. 帧数及编码单位上限。
6. ACK 重试与超时。
7. 终局等待/重发合并/重同步撤销；保留后不被未发送 ACK 阻挡。
8. 显式 visual 所有权、忽略伪造 visualHandled、独立队列、fallback、片段规则。
9. 真实 Node Worker 转移二进制 buffer，使用生产 BinarySnapshot 解码并保留，返回 token；验证顺序释放和取消后的迟到回包。
10. 不同实例的相同 epoch/id 不能完成新实例回执。

第 9 项不是纯假 Worker，但只有最小解码帧，不是完整世界恢复/HUD/渲染迁移。VM IIFE bundle 的 `import.meta` 空值警告属于既有测试方式限制；该合同测试使用默认 feature policy，实际浏览器场景使用 Vite 环境。

## 最终双端 LAN + 主机重连
最终源码运行既有 `check-normal-multiplayer-browser.mjs`，产物 `artifacts/lan-presentation-receipts-20260925/lan-final/`。2 玩家 + 20 AI，seed917，15 秒，D3D11 / RTX 5060；steady / command-held / prediction / weapon / particle fixture 全部 false，stall=false，reconnect=true。这里关闭的是测试夹具，不是关闭生产预测功能。

- 15,000ms 内推进 **900 tick**；主机物理速率诊断中位数 **59.881Hz**。
- 主机重连：tick1106 → tick1266，matchId 不变；既有场景也验证 direct authority 在重连后的回退。
- loaded=true，roomStatus=running，failures/errors 均空，cleanupCompleted=true。
- 主机/客端 HUD FPS 样本中位数 58.066 / 58.067；状态年龄样本 P95 6.440 / 17.325ms。
- HUD 平滑 acknowledgementMs 样本 P95 78.336 / 53.926ms；**不是单次原始 ACK 延迟的 P95，更不是鼠标到画面的延迟**。

**同机 loopback、共享无头浏览器、未加载样式的 300×150 canvas、没有主动操控夹具。** 仅作为真实联机接线/重连验收，不代表全分辨率帧率、大型战斗性能、WAN/Steam/n2n 或真实交互手感。本轮没有配对 before/after 性能测量，不能以这些诊断值宣称提速或全场景无回归。

早期 `lan/` 是补 owner 之前的通过记录；**最终接纳使用 `lan-final/`**，不混淆两个源码状态。

## 范围与证据
冻结 656 个非生涯生产模块：只改动 `LanBattle.tsx` / `protocol.ts` 两个已有模块，其余 654 个 hash 一致；新增 `PresentationReceipts.ts`，扩展既有 `check-background-heartbeat.mjs`。完整 hash 及最后复核见 `source-changes.json` / `acceptance.json`。

证据目录 `artifacts/lan-presentation-receipts-20260925/`：
- `before-browser.json`、`source-changes.json`、`acceptance.json`
- `cross-owner-before.log`（实际失败反例）
- `typecheck-final.log`、`lint-final.log`、`receipts-final.log`
- `lan-final/result.json`、`lan-final.log`

保留所有无关优化/生涯 WIP，未暂存、提交、推送、打包或发布；版本仍为 0.2.11，工作区源码已更新。

## 尚未完成
- 生产 raw decode/delta 与恢复/渲染尚未整体移入同一 Worker，避免全量世界拷回主线程的方案仍需落地。
- HUD / 地图 / 部署仍需有界跨线程数据协议，并保持方法、别名及可变元数据语义。
- 输入、镜头、已接受动作、音频、设置与 canvas 失败回退的跨线程顺序尚需完成。
- motion/combat 仍为既有同步路径；本地主机 LanSnapshotDecoder 两普通帧 + 一末帧信用未变。
- 真实联机主线程繁忙时的延迟收益，必须在完整迁移后验证。没有新增 GPU 计算、并行火控或对象池。
