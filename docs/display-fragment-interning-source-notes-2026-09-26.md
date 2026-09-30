# v2 捕获片段驻留候选：来源、边界与预注册（2026-09-26）

## 来源与原因

上一轮默认 v1 审计完成，是有用进展：64 舰 522 个独立武器定义根只有 9 种内容，跨样本源内容稳定，但不能据此跳过可变 source/receiver 的扫描。

当前 `DisplayDefinitionCapture.ts::inspect` 已缓存每个根的 fragment，仍逐次检查全部 descriptors/value。稳定的不同根仍持有各自构造的同内容长字符串和 fragment；`reference` 每个实例在每帧都以内容字符串查询帧内 indices。此处候选只减少**同内容已生成片段的重复驻留及帧内长字符串查重**，不取消任何源数据准入扫描。源码判断不是已证明时间热点，必须用完整链路门槛淘汰无收益的候选。

这是 LAN v2 捕获内容片段的规范化，不是已否决的 RenderWeaponDictionary publication token，也不是可变根身份/单帧“见过免读”缓存；不恢复旧候选。

本轮仅修改 Web 协议内部缓存，不改变原版玩法、UI、写入 API、模拟频率或画质。原版 API/实机不提供此私有缓存的对照；可变定义边界沿用此前 display-definitions-source-notes 的原版证据。本轮不进行原版实机验收。

## 候选

- 新生成且已通过既有深度/节点/字符预算的 fragment，可在私有、有界内容表中驻留同一只读片段。
- authority 内容表使用既有 cacheEntries/cacheCharacters/cacheNodes 三重上限；只保留片段文本/节点数/高度，不保留 source、world、ship 或 receiver。
- 每个 Capture 增加有界 fragment→index 速查。缓存未命中时仍使用原完整字符串 Map；驻留表逐出后，同内容不同 fragment 仍必须落到相同帧内 index，不能依赖 hash 碰撞或跨帧 ID。
- 所有可变根检查、fallback、采样时机、顺序、表预算、v2 wire 格式及 receiver 保持不变。默认 v1 完全不启用驻留工作。

## 一次集中正确性检查

完整实现后一次 typecheck、改动 lint、既有 check-native-capture 的 display-v2 与相关 display codec 过滤场景。添加同内容新根、跨帧更新、驻留逐出后重新遇到旧根、表容量、长期持有的旧帧、访问器/Proxy读序等回归；对私有缓存上限另做测试态只读检查，不向生产暴露计数 API。

## 正式性能门槛（编码前写定）

- 复用 benchmark-authority-cpu；64 舰、2 玩家、seed917、LAN capture+packed numbers+真实binary+LAN apply；240 预热+240 测量 tick。
- 对照为当前保留 v2，不与历史 v1 数字混用。ABBA 顺序，完整冻结构建图，各轮单独进程。无 profile/计数插桩；四臂均保留，不择优补跑。
- 配对为 1-before/2-after 和 4-before/3-after。**每一对**：capture均值至少下降3%；capture P95不得回归超过3%；权威三段（simulate+capture+encode）均值/P95及串行五段均值/P95不得回归超过1%。
- 每帧累计wire hash、末态完整receiver图hash、字节数完全一致，所有正确性合同通过；否则不保留。
- 若性能不通过，精确撤回本轮生产修改，保留失败工件及通用工具/回归。不得改门槛再测。
- 即使通过也只保留相对当前 v2 的候选，仍不默认开启 v2；不能声称模拟Hz/真实联机延迟提升。晋升默认路径仍需解决 v1/v2 权威成本、可写receiver兼容边界及真实ACK→draw验收。

## 拒绝后的单次原因诊断（性能结果已定，不补发通过）

正式 ABBA 两对均未满足门槛，生产候选和候选专用测试已精确撤回。第一对 capture 均值仅−2.064%，第二对出现跨阶段的大幅时序漂移；该数据不足以将约两倍的耗时差异归因于片段驻留。保留全部四臂，不重复正式性能组。

现在对**原保留版本 before.mjs**单独运行一次现有 `--profile`，64舰/240预热+240测量/500us采样；目的只是在当前冻结场景内区分 inspect 字段准入、reference 查表、其余捕获工作。它不是额外性能臂，也不得参与候选通过判断。函数自耗时样本、递归去重的 inclusive 样本及源码行采样均只是定位证据，不给精确CPU耗时/真实联机尾部结论。
