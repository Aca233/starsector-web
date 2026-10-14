# 完整本地呈现编解码只读审计（2026-10-09）

此文只分析现有完整字段编解码，未修改共享 Encoder/Decoder。Rust 规则、字段、预算、渲染和输入不变；没有用减少字段或省验证解释性能。

## 已有运行证据与边界

ROOT 的 installed-6104 ABBA 同 22 根舰/176 身体场面中，Rust 包约 1.27MB、编码30.59ms、解码14.2ms，TS约450KB、编码10.29ms、解码6.3ms。这是原身份方案的实场成本，不适用于随后变更的源码。`profiling-installed-local-6104/pipeline.cpuprofile` 是同场运行的 encoder/authority 采样，没有运行 Decoder，不能据此给 Decoder 编造 CPU 自耗时排名；采样本身也增加开销。

该旧采样60帧中 `captureGraph` 自耗402.929ms、其 `value` 子函数自耗363.118ms，均来自 `CombatPresentationEncoder.ts`；`(garbage collector)`435.088ms。Sender 仍逐帧完整扫描全部 live 字段，再按对象身份比较；新的对象身份必发完整记录并建立历史行。船代理完成 projector-owned nested record 身份复用后，`tmp/flight-presentation-delta/result.json` 保存独立40帧 strict/own-key/alias/旧输入与帧隔离通过，sourceUnchanged true。实际tick10–40的31帧：packet735220→280911bytes、encode8.365→6.777ms、decode9.387→4.787ms；project8.623→11.016ms有所增加，三个阶段总26.374→22.581ms。此诊断不是最终完整游戏可玩证明；最终同场整场、数值和默认gate仍由ROOT完成。

## 精确源码热点与保合同的候选

1. `CombatPresentationEncoder.ts:211–218` 对每个发生变化且非 sparse patch 的普通对象反复 `JSON.stringify(keys)` 查 shape。可复用 LAN 已验证思路：本包按 type+键数+首键找候选，逐个严格比较所有键与顺序，保持首次出现 shape id、所有错误门、预算、整包自包含。此项消除临时 signature 字符串，不减少字段扫描。需要同冻结 publication 的全包字符串/shape/value 顺序逐位对照；船身份优化已经让更多记录走 sparse patch，收益须实测，不能承诺仍按旧比例增长。

2. `CombatPresentationDecoder.ts:48–59,133,218` 已逐 shape 验证所有键，但为每个 changed object 的 accepted Entry 再 `plan.keys.slice()`。同一种 shape 被很多舰的 mounted records 使用；可在本包形状验证后仅复制每个 shape 的 keys 一次，plans 共享这个 decoder-owned 数组。ObjectPatch 继续复用 accepted previous.keys。保留所有原键/重复/危险键/behavior/原型/预算校验及候选图事务；传入 packet 在 apply 后改变 shape.keys 不能改变 accepted history。此项只减少分配，不能改为直接持有 caller 的 packet.keys。

3. `CombatPresentationDecoder.ts:103–126` 的 sparse row 重建仍 slice 完整 accepted row、逐值验证并重建 refs/metadata；`192–206` 仍核完整可达图、live/metadata预算；`229–260` 把全部 reconstructed 字段写入 display 对象。不能仅验证 patch 字段或跳过完整图；也不能仅更新 changed field，因为 display-owned mutable 对象可能在帧间被修改，原完整写回会修复它。现有旧 packet/history 与失败后不提交合同需要保留。若后续优化，优先实际分配与形状复用，不把规则/隔离校验省掉。

4. `CombatPresentationDecoder.ts:210–218` 对每个 changed node 创建 Plan/Entry、`229–260` 再逐值回放；旧 Rust graph 身份变化导致大部分节点都变，放大这些成本。船身份保留会自然减少 plans 数量，比在 Decoder 中特殊信任 Rust 包安全。不能因为来源为 Rust 就绕过未知原型、模拟类、dangling refs、retired nodes、epoch/revision/tick或budget检查。

## 建议实施顺序与验收

先让船身份复用按原共享编解码完整验收并冻结。若最终同场编解码仍占瓶颈，ROOT 再选择前两项，先在同一 packet/caller 隔离合同下独立窄改；无需改变协议、画面或玩家取舍。所有 full-value/own-presence/alias/order/旧packet隔离/非法包失败无提交必须保留，不能把采样微基准代替可玩场面。此审计没有修改任何 shared codec，也没有重跑旧 native 构建。

## 本次已授权窄实施方案（2026-10-09）

ROOT 已授权在船呈现身份方案冻结后实施上面的两项。目标是同样完整的 Rust 呈现包减少纯分配，不更改玩家画面、操作、规则、字段、协议预算或联机权威；生涯和存档无影响。无新的产品取舍。现有 UI/public 普通 capture 的 JSON.stringify/toJSON 可观察扩展回调合同继续原样；shape bucket 仅用于 captureDetached 进入的封闭 Rust 完整数据路径。按 type、键数、首键缩小候选后仍逐键严格比较顺序，保持首次出现 shape id 和所有原验证。Decoder 在全部 shape 属性验证和预算检查后复制 keys 一次，plan/history 只共享 decoder-owned 数组，patch 沿用此前已隔离的 keys。

实施顺序：保存两文件旧基准 → 窄改 → 同一 actual22/176body native completed publication 向旧新 encoder 发相同图、全 packet/wire 与旧新 decoder graph逐位对照 → 集中现有稀疏包非法、caller shape mutation、旧帧/失败不提交合同。失败仍拒绝，不切后端；取消/退出和玩家输入流程不变。验收不把孤立编码耗时当整体可玩证明，最终源码与新 Cargo 同SHA整场仍由ROOT集中验收。原版证据沿用 defense source notes 和既有完整Rust呈现方案；本块没有玩法或界面布局变化，实机补验仍未授权。

## 本块实际集中验收

两生产codec按上述范围实现并冻结。首次actual40完整wire/图比较走完无差，但运行中相关调用者源码改变，最终source绑定正确拒绝该次资格；仅定向复查一次，同actual22/176body安装6104、40帧及4拓扑变异，最终26,122,937 strict值、3,336,402节点、259,381 alias通过，所有packet shape ID/keys顺序/字符串/wire words/visual完整逐位同，输入、旧facts、旧packet、旧decoded隔离与失败终止保持，sourceUnchanged:true。证据verification-presentation-codec/result.json。既有codec合同只在测试构造把已移除wolf/lasher换成实际bundled舰包，全部断言原样，200200patch checks/485shape checks/232shape packets/116exact，稀疏非法、完整图非法、失败无提交、caller shapes隔离、consumer字段修复和JSON/toJSON hooks均通过。项目oxlint只查两个变更文件exit0。

串行孤立诊断还记下encoder6.342→7.368ms、decoder6.274→7.468ms。机器同时有诊断编译，且固定before→after顺序，不是无干扰ABBA，不能声称本块提速；bytes两边均280910.71完整相同。最终整场是否符合性能门由ROOT同新Cargo/current所有源码集中实测判定，本块fullBattleReady仍false。
