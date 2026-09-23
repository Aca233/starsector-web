# 单次WebGL绘制的舰船列表

## 实施前核实
原版0.98a-RC8的权威空间索引及绘制/模拟能力边界沿用 docs/render-projection-source-audit-2026-09-22.md（CombatEngine.java:1185–1200）；不改变原版可见性、部署、撤退、画层次序及舰船/子模块顺序，不操作桌面。当前Web CombatEngine.ships 通过capitalShips→combatShips→fighters/bombers/drones生成列表。WebGL各pass在一次同步绘制中至少五次读取相同列表，每次都重新flatMap/filter并分配数组。

预期：仅在WebGL render同步调用范围内取一次ships，并供该次全部pass使用。每次调用重新取得，不跨RAF/authority tick缓存；跳帧和context lost不取列表。原稳定borrowed view仍保持原实时读取语义；detached展示已有稳定列表，直接复用。仅浅列表，不改舰船对象、主舰视角、装甲、特效或协议。

验收：既有多队WebGL场景（舰体/调试标记/超32队/部署/死亡/撤退/客机视角）通过；原渲染路径与单次列表路径像素相同、VisualRandom调用计数相同、真实getter调用数减少。附同48舰图形场景正反顺序CPU提交计时，不以getter微基准当FPS/Hz；只保留合并CPU耗时净下降且无明显单臂回退的候选。

## 首次实现失败后的定向修正
以Object.create(view)增加继承层的包装方案虽然把名单读取8→1、3视角像素/RNG一致，但48舰绘制提交均值+4.49%，不保留。保存原始结果为result-wrapper-rejected.json。改为直接在现有WebGLPassContext新增ships字段，所有pass读取ctx.ships：不包装视图、不额外间接读取所有其它热属性。接口更明确，旧borrowed/detached view完整保持原状。随后只复查同一失败场景。

## 最终决定：两种实现均不保留
直接context版本类型/lint、多队状态、三视角共8294400字节像素/RNG一致、列表读取8→1全部通过。但48舰正反顺序渲染CPU提交均值21.3425→22.7233ms（+6.47%），最后一组两臂接近，不足以证明净提升；测量包含同步GL调用及无头环境的开销，不将其解释为必然的代码因果或真实FPS变化。没有为追求减少分配数而保留未通过的优化。八个源/测试文件均恢复本轮冻结原字节，候选和测量保留在artifacts作负结果；没有跨帧名单缓存或新增pass API进入生产。
