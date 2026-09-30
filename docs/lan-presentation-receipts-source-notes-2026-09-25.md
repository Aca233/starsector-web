# LAN 呈现消费回执：实现前记录（2026-09-25）

## 原版证据与边界
重新读取原版0.98a-RC8的 `../starsector-core/data/config/settings.json:8-12`（60fps/vsync）及 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEngineAPI.java:67-89`（实体/玩家/停止/视口能力）。本轮为Web联机的接收所有权/回执协议，不改变原版玩法、画面、实体或频率。无原版实机补验，继续纯后台/隔离无头，不启用子代理。

## 当前证据 → 预期行为
`protocol.ts` 当前在同步订阅者返回后直接发 state-consumed；visualHandled 是可变消息字段。它们不能表示异步Worker是否实际保留了数据。`server/LanStateCredits.mjs:116-129` 的 ACK 会累计释放 <=seq 的所有在途帧，因此后一帧先完成时不能越过前面未完成的帧发回执。`server/lan-server.mjs:510-520,1006,1348-1355` 在开始同步/可见性变化时清空远端信用，迟到的旧代际完成不能给新代际发ACK。

实现有界回执所有者：state/visual 独立有序队列；同步路径当场完成，不增加定时器/微任务等待；异步调用必须在订阅回调返回前显式defer，并提供取消回调。回包只用本地生成的epoch/id匹配已有记录，绝不信任Worker自行提供seq/匹配身份。预算沿用服务器state最多64帧/32MiB编码长度、visual最多4帧/4个最大baseline；这是保留信用的预算，不冒称解码对象实际堆内存预算。

必须处理：累计ACK有序释放、重复/错token、回调异常、过量接收、回执本地发送失败、有界超时、重连/新launch/隐藏/退出失效。ended只在既有接收均完成后发布；至多保留一个有界终局回调，取消代际时一起作废。partial visual fragment沿用现有assembler/fragment receipt，完成baseline必须由实际消费者报告成功。

## 正式接入范围
修改实际LanConnection及LanBattle，完整快照和已组装visual明确报告consumed/discarded；坏帧失败不能伪报成功。保留本地主机LanSnapshotDecoder信用、motion/combat同步处理、原二进制/delta校验、HUD/音频/渲染频率。默认仍为同步主线程呈现；本轮不声称生产Worker或跨线程HUD已完成，不把postMessage接受当作消费。

## 验证
修改前冻结656个非生涯生产模块（artifacts/lan-presentation-receipts-20260925/before-browser.json）。集中typecheck、改动文件lint；扩展既有check-background-heartbeat场景，只选新增presentation receipt测试（不运行原有输入fixture）。对实际LanConnection的合同和实际后台Worker消息往返进行验证，再跑一次既有真实双端LAN+主机重连，steady/command-held/prediction/weapon/particle均false。不运行全套，不注入键鼠，不声明无配对的性能提升，不提交/打包/发布。

## 实现后补记：实例边界反例
复核时发现：仅有 epoch/id 不能隔离不同的接收实例。两个新实例都可能发出 epoch=0/id=1，旧 Worker 的迟到回包如果误送到新实例，会完成错误的回执。新增反例先运行并真实失败（actual=true、expected=false，见 cross-owner-before.log），随后把 token 扩展为 owner/epoch/id；owner 是通过 crypto.getRandomValues 生成的 128 位随机实例标识，不依赖 HTTPS 专用的 randomUUID。实际 Worker 测试中的完成/取消消息也携带 owner。owner 用于本地关联隔离，不是来自不受信任 Worker 的授权或密码学认证。

回执的 ACK 闭包由单独 receiptSender 作用域创建，只保留小型身份信息，不捕获整个收包 m/frame。state 与 visual 分别按接收顺序释放，终局等待已接收内容实际保留/丢弃，不因已经保留但尚未成功发送的 ACK 无谓等待。生产呈现仍在主线程；验证结果和未完成范围另见 lan-presentation-receipts-validation-2026-09-25.md。