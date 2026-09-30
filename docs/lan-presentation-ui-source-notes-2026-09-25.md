# LAN UI-only 增量传输：实现前记录（2026-09-25）

## 原版证据及范围
已重新读取原版 0.98a-RC8 `../starsector-core/data/config/settings.json:8-12`（60fps/vsync）和 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEngineAPI.java:67-89`（实体、舰队、玩家和视口读取能力）。本轮仅处理 Web UI 跨线程数据所有权，不改变原版画面、输入语义、战斗规则或频率；没有新的原版实机/桌面操作许可，实机验收仍待核实。

## 证据 → 预期 → 差异 → 验证
现有 `LanPresentationViews` 的 hud 依赖 HudContactRecord/Vector2 方法和共享引用，ShipSpec 也可能动态变更；直接 structuredClone 会丢方法，把整个世界复制回来又抵消 Worker 收益。已有 CombatPresentationEncoder/Decoder 为本地战斗提供有界、顺序增量、白名单原型、不可变元数据字典和原子图校验。复用其底层图路径，增加严格隔离的 UI-only envelope，拒绝模拟/渲染原型，不调用 render projection、packed visuals 或还原完整世界。

正式 runtime 提供 UI 发布所有权；默认 LanBattle 继续使用原有直接视图，不为尚未完成的 Worker 默认引入每帧编码。生产传输最多一包在途，未确认时不再捕获或排队 UI 快照；下一次调用只捕获当时最新值。owner/epoch/revision 防止旧确认释放新包；按接收完成后归还可转移 buffer。消息发送不是消费。停止/重同步/释放需撤销旧所有权。UI 数据必须保留 methods、alias、Object.is 数值、可变定义更新和部署/地图历史快照稳定性。

在既有 Offscreen 场景扩展主线程实际接收 UI 包与 Worker 回执，涵盖 mutable spec、坏包/越序、退役节点、重同步与处置。包含已有 render codec 回归，确认共享底层变更未破坏渲染路径。只在整块完成后集中 typecheck、改动文件 lint 和该场景；具体失败才定向复查。不跑全套、不启用输入夹具，不提交/打包/发布，不以测试 Worker 通过冒充正式 LAN 迁移或实测加速。
## 实现后发现与调整
1. 原有 metadata 字典对每个入口分别 immutableCopy，会把可变舰船定义与原定义之间共享的子对象拆开。真实 mutable-spec 反例在第 4 个 UI 帧失败。UI 通道因此将定义纳入同一身份/增量图，不另建深拷贝 metadata 入口；静态字段不重复传输，但仍有全图字段检查成本，不能宣称零编码开销。原 render metadata 路径未改变。
2. 接收后的地图/部署历史必须不可变；直接复用 copyDeploymentView 会对每艘舰船的 spec 分别深拷贝，破坏同舰型行之间的共享引用。真实 Worker 接收对照暴露此问题，已使用按源节点缓存的 immutable UI history copy 修复，保留别名并逐次检查可变字段。HUD 仍是 live facade；冻结历史不是 live HUD 的同一个可变对象，不声称跨历史/跨端口共享所有引用。
3. 工作区并行出现其它任务的源码改动。最终验收使用冻结基线加本轮 5 个已有模块/1 个新增模块生成的 candidate 源码图；未覆盖或回滚并行改动。全项目首次 typecheck 被并行新增内容文件 ZhuYuanPack.ts 的 TS2352 阻挡。隔离的 before/candidate 应用源码图均无类型错误。
4. 这轮只完成 UI 读数据通道。远程 tactical/input 命令不伪造成功，仍未通过该通道传输；默认 LanBattle 仍在主线程，尚未启用 production presentation Worker。