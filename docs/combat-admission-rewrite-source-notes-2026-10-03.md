# AI 资格检查算法重写 — 2026-10-03

## 最小对照（先于生产修改）
- 原版目标 0.98a-RC8；C:/starsector-core、C:/decompiled 本轮确认仍不存在。原版源码/界面/实机待核实。本块只改 Web 执行成本，不改变规则或 UI，也不占用桌面。
- Web 证据：combat-root-cost-audit-20261003，nativeMember 每步229.442次、Object.hasOwn 57580.975次；资格路径采样归因约2.238ms。CombatAIPhase.plan 是公开分段 API，允许两次 plan 之间任意替换实例方法或组件；没有 revision 的可变实例不能获得永久或整阶段安全证书。
- 预期：完整保留原有拒绝条件和动态回退。不能直接删除模块复查。当前差异是每个实例逐个探测整个原型方法列表，以及每个原生 world 在两个消费者处反复构建全部 descriptor。
- 本块重写：按实际 own 属性检查原型名字交集，特别是 ShipSystem 的32个 own字段对76个原型键。检查包括不可枚举 own 覆盖，不调用未知 getter，不缓存可变实例资格。只有在原生生产者新建并冻结的纯数据 world 上，可复用其描述符事实；这个事实不是 Worker 身份、角色、read-plane 或 callback 权限，owner 引用和回调拒绝条件仍逐次检查。通用 world 继续完整描述符检查。
- 不做：不降低dt/AI/威胁频率，不缩减实体/挂点，不更改ms，不缓存整步状态，不重新开启失败的state-core/motion方案，不改生涯或发布。

## 验证
完整实现后一次 app tsc、改动文件lint；同一个seed917 standard 2玩家+20AI/734挂点场景。270逐步全部原始快照、全部AI导航/非导航memory、防御memory、双RNG严格对照（无控制差异白名单）；当前默认为基线。150warm+120sampled ABBA 包含生产者准备、资格和全部整步成本。复用既有定向失效/闭租约/MANUAL场景并增加两次plan之间的方法/组件替换与非枚举覆盖。计数不是性能收益；若实际没有收益则撤回候选生产实现并记录。

## 本轮结果
算法候选已完成逻辑对照，但独立ABBA整步34.077→38.845ms、AI11.998→12.620ms，没有收益，拒绝并撤回全部本轮生产修改；四文件字节对照通过。详见 combat-admission-rewrite-results-2026-10-03.md 和 artifacts/combat-admission-rewrite-20261003/result.json。未实施无证据的跨plan实例信任，未宣称执行边界根治完成。
