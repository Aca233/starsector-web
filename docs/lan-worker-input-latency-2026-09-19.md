# 房主补步期间的输入延迟（2026-09-19）

状态：补步调度与心跳修复已实现，隔离验证通过；完整双浏览器战斗验收未通过，不能宣称整场延迟已解决。未替换现有 3005/3007 服务。

## 根因和改动

`host.worker.ts` 的一次调度原先最多连续执行 6 个完整物理步，期间不会处理 Worker 消息。高负载补步时，即使输入已从 relay 转到房主主线程，仍可能在 Worker 任务队列里等待整个批次；旧输入可能因此连续用于多步。

现在只在完整物理步之间、当前任务已工作至少 8ms 且仍有待补步时，通过一个复用的 MessageChannel 让消息队列运行一次，再继续原补步批次。Promise 微任务让出不能处理消息，嵌套 setTimeout 会引入额外计时钳制，因此均未采用。

保持原每批最多 6 步、1/60 dt、欠下的物理时间、批次末捕获、单在途快照 credit 和过载恢复规则；不因让出而额外捕获/编码快照，不降低 60Hz 目标，不改变 AI/战斗规则。每次恢复执行前检查 lifecycle/running/authority，停止、重新初始化和新世界不能被旧回调继续修改。AI 多 Worker 仍关闭，没有新增计算 Worker。

## 已有证据

- 64 项诊断：直接提取真实 step 函数、以虚拟引擎/时钟/任务队列覆盖耗时、积压、输入、终局、停止、重初始化及重入。无新输入时，步数、dt、战斗推进、剩余欠时、捕获次数及恢复规则相同。此为调度诊断，不是完整模拟状态证明。
- 真实 Chromium Worker/MessageChannel，6 个合成 12ms 完整步骤，旧→新→旧→新：输入任务排队分别约 70.60/10.90/70.30/10.30ms；新版第 2 步已经使用新输入，旧版该批次始终旧输入。仅证明浏览器任务队列机制，不是实际游戏性能成绩。
- TypeScript、lint、生产构建通过（原有大 chunk 警告保留）。

## 临时产物

- `artifacts/lan-worker-latency/scheduler-result.json`
- `artifacts/lan-worker-latency/task-yield-result.json`
- 基线：`artifacts/lan-worker-latency-baseline-preview`
- 候选：`artifacts/lan-worker-latency-preview`

所有诊断均在 git-ignored artifacts，没有新增项目测试或 runner，没有素材 hash/size 审计。
## 双端验收发现并修复的心跳问题

原构建的真实双浏览器 8 舰测试已经暴露短暂主动重连：双方均由客户端关闭（1005）并恢复登录，没有 Worker 过载恢复或页面错误，期间按键样本丢失。不能把这一轮作为稳定性通过。

代码证据：旧 probe 要求 bufferedAmount 严格等于 0，连续 60Hz 发包时心跳可能在每次检查都被延后；旧超时只看 pongAt，把未发送探针也当成失联。

`protocol.ts` 现在允许在至多 16KiB 的小发送积压下发出单个心跳；解析成功且 type 为字符串的当前连接消息更新 liveness。10 秒无任何有效消息，或一个已经成功发送的 ping 超过 10 秒未获得匹配 pong，仍照常重连。错误 pong、旧连接回调、前后台切换和发送失败不会错误续命或保留假 pending。

实际 LanConnection + 二进制解码器的 17 项虚拟 WebSocket/DOM/时钟场景、146 个断言通过；包括 30 秒持续大队列下未发 ping 但有状态的连接、真正静默、已发 ping 无回、错误 pong、旧 socket、前台恢复与 cleanup。并非网络性能测量。

## 并行工作边界

本轮过程中其他任务修改了舰船多系统/配装及相关 AI、渲染、协议字段；已保留这些变动，尤其 host.worker.ts 中 system 动作 value 分支。本轮控制/候选生产包可能含不同时间点的依赖，因此游戏数据只能用于集成验收，不能声称受控的整场加速百分比。隔离调度、真实 MessageChannel 机制和心跳虚拟场景各有单独对照证据。

## 完整链路验收与限制

同机两个真实 headless 浏览器、8 舰、60Hz、AI owners 关闭：原构建曾维持约 1.00×，但出现客户端误断线；后续旧/新 Worker 构建均在启动阶段出现严重墙钟耗时和过载终止。当前候选与更早基线重新测量也失败，不能将差异归因于本轮代码或他人的多系统修改。

同一生产候选、同一 match 的独立 Worker（不绘制、不联网）可正常推进约60Hz，多数单步1–3ms。仅在诊断中禁用 draw 调用（保持网络、输入、解码路径）时，双端8舰约59.67物理Hz、0.997×、42.87接收Hz，无恢复/断连。这只能隔离绘制相关差异，不是有效游戏验收；生产未禁用绘制。显式D3D11（确认为RTX5060）、同浏览器不同context、关闭GPU计时、诊断RAF60、开战前延迟5秒暖场、另用Chrome均未消除启动过载；这些诊断开关均未写入产品。尚无充分证据认定具体GPU/驱动/OS根因。

相关证据位于 artifacts/lan-worker-latency/：candidate-8-no-draw.json、candidate-8-d3d11.json、candidate-8-shared-browser.json、candidate-8-no-gpu-timer.json、candidate-8-raf60.json、candidate-8-warm-draw.json、baseline-8-d3d11-current.json、candidate-8-chrome.json、isolated-worker-result.json，以及Worker/主线程CPU profile。采样墙钟空隙不能直接当成CPU成本。所有诊断自己的浏览器和随机端口relay均已关闭。

用户随后明确真实问题是“LAN 300+ms；Steam进入战斗即断开”，不再以Steam 300ms虚拟链路解释LAN观测。新桌面直连与传输修复单列文档；真实两机LAN/Steam验收仍需区分RTT、输入确认、模拟推进与渲染耗时。

## 2026-09-19：补充完整双端有效数据（后续环境）

此前完整浏览器启动过载的失败记录仍有效，但后续相同0.2.2冻结前端、两个独立headless Edge、正常D3D11绘制已能完成测试。不能凭环境变化确定先前GPU/调度根因，也不再把此前失败当成当前唯一结论。

- 8舰/12秒：实收59.56Hz，物理59.98Hz，战斗0.99964×；真实按键边沿至客端权威确认平均26.08ms、P95 46.83ms；无断线/恢复。
- 32舰/20秒：实收22.79Hz，物理59.82Hz，战斗0.99787×；按键确认平均129.58ms、P95 192.11ms；无断线/恢复。快照约438KB，房主步骤约9ms、捕获4.5–5.4ms、编码5.2–6.5ms，三者合计超过16.67ms。
- 同冻结前端32舰改走已有JSON回退（仅诊断拦截Worker初始化）更差：12秒实收12.72Hz，按键确认平均209.84ms、P95 342.84ms，因此未采用JSON替代二进制。
- 后续32舰6秒采样约26.26Hz/97.92ms，说明短轮环境与战斗演进噪声明显，不能拿不同时段样本硬算整场优化百分比。

数据位于 artifacts/lan-worker-latency/packaged-022-{8,32}-current.json、packaged-022-32-json.json、packaged-022-32-capture.json。均为本机loopback，不能代表用户物理LAN/VPN RTT或Steam双账号结果。测试始终保留正常绘制、60Hz目标、1/60物理步长、AI多Worker关闭；报告passed只代表输入/快照一致性与清理检查通过，不代表大规模性能达标。

## 单遍投影编码与当前集成结果

新增 encodeProjectedBinaryFrame，只供 captureCombat 的新建声明式数据使用：把校验与编码合并遍历，保留任意对象调用方原 encodeBinaryFrame 的两遍语义。所有数值仍用固定版本 MessagePack 原编码，未用float32/量化；不兼容值仍回退JSON，键/深度/16MiB限制不放宽，返回可转移的独立缓冲。

3,073项临时断言通过，含3份真实32舰帧与旧编码器/库逐字节一致、解码一致、3000份随机嵌套数据、Unicode/数值边界、无效值回退、超深/超预算和转移后下一次编码。3份离线真实帧编码均值约2.32→1.65、2.57→1.89、4.37→3.08ms；这是编码阶段的收益，**不是整场延迟降低三成**。

- codec-baseline-32: passed，收包21.47Hz，物理59.16Hz，战斗0.9913×，按键确认均值121.22ms/P95 194.06ms，恢复0，未发出边沿0。
- codec-candidate-32: failed，收包23.80Hz，物理58.21Hz，战斗0.9722×，按键确认均值122.24ms/P95 209.08ms，恢复1，未发出边沿3。
- codec-candidate-8: passed，收包59.26Hz，物理59.80Hz，战斗0.9979×，按键确认均值25.01ms/P95 51.70ms，恢复0，未发出边沿0。
- codec-candidate-32-repeat: passed，收包20.89Hz，物理59.89Hz，战斗0.9978×，按键确认均值136.65ms/P95 225.04ms，恢复0，未发出边沿0。

候选第一轮32舰出现一次262ms欠时恢复，导致3个输入边沿在同步期间未发送，不能称稳定性验收通过；后续20秒32舰未复现，但收包仍约21Hz。这表明减少编码遍历未消除模拟/捕获/展示总成本，当前没有证据宣称32舰端到端延迟已显著下降，更不能说用户双机300ms已解决。不修改计时/过载规则以隐藏该结果。正常8舰仍接近60Hz。后续实际链路压缩与Steam专项另列报告。
