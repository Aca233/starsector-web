# 显示定义表：边界对照（2026-09-24）

本轮是传输/接收表示优化，不改变玩法、界面布局、物理或 AI 频率。原版版本沿用本机 0.98a-RC8。

- 原版数据：starsector-core/data/weapons/amblaster.wpn 第 1–28 行含武器贴图、颜色、挂点、muzzleFlashSpec 与音效；这些定义必须完整保留，不能只发送少数渲染字段。
- 原版 API：decompiled/starfarer_api_source/com/fs/starfarer/api/loading/WeaponSpecAPI.java 包含多个 setter；不能假定挂点使用的有效定义永不变化。
- 原版 API：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipSystemSpecAPI.java 第 22、27–29 行的 range/cooldown/regen/uses 接受 MutableShipStatsAPI；动态有效值不应错误归入永久静态表。
- Web 现状：LanShipProjection 分别采样 weaponSpec 与 displayRange/displaySpeed，系统 definitionData 与 fluxCosts/fireRates/fireSlots 分开。新路径仅提取定义，保留所有动态采样及其顺序。
- 最小预期：每帧自包含、无历史 ACK 依赖；表中内容不可变且接收器自有；顶层可变标量逐次检查；未登记可变子对象/访问器走旧捕获。定义内容变化生成新的内容身份，不冻结权威对象。
- 身份边界：Web `LanDisplayShip.getWeaponDisplayRange/Speed` 和 `LocalFirePrediction` 通过 `spec` 对象身份查询挂载点动态值；相同内容的定义只能共享不可变子树，挂载点根对象须独立，内容未变时复用本挂载点的根。此项用不同动态射程/弹速的同内容双挂载点回归验证，不修改原版玩法。
- 验证：旧/新 JSON 与 binary 的全显示数据值、同 seed 演进、换装/原地修改、回退/重新准入、保留包独立性、资源/访问器/索引/预算拒绝、跳帧和冷重连；另测完整 capture/encode/decode/apply。
- 实机/界面对照：未操作原版或 Web 桌面；没有新的 UI 交互或画面改动。本轮不声称完成原版视觉等价或真实输入到画面验证。

## 捕获扫描优化的补充边界

- 再次核实本机 WeaponSpecAPI.java 的 setter（例如第 39 行 setRarity）与 Web effectiveHullModWeaponSpec 返回的可变顶层对象，不能跨帧只按 spec 身份缓存。
- 已有 CPU profile 定位：64 舰测量 240 tick，定义 inspect 自身约 372 ms；逐属性描述符读取是主要采样点，另有值数组填充、子对象资格查询、二次 every 比较。该 profile 只定位热点，不作性能收益数字。
- 本次预期：仅合并同一次扫描，稳定根不分配值数组、不重复校验已确认未变的键/子数据；仍逐次枚举键、检查原型、读取每个顶层描述符并比较真实值。值或键变化后从首次差异起重新收集/校验；访问器不执行并回退旧路径。
- 验证：同帧及跨帧值/键/顺序/描述符/原型变化、可变子树替换、getter 零调用、预算回退与保留包；完整 v2 报文与接收图必须与上轮冻结版本相同，另作无 profiler 的完整 CPU 对照。原版实机/浏览器渲染仍未补验。
