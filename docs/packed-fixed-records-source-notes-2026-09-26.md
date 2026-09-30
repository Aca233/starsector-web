# 固定视觉行编码专门化：修改前对照（2026-09-26）

## 证据
- 原版本机0.98a-RC8：../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8/9 实时位置/速度，WeaponAPI.java:158/185/262 当前角度/位置/spec。这里只约束实时读取语义，Web二进制显示编码没有原版对应算法。未修改玩法、界面或渲染效果；没有原版可见实机验收。
- 当前 FixedTimestepScheduler.update 的 Promise 完成分支直接 drain 积压；LocalWorkerHost ACK 完成后 resolve/pump，没有发现每步强制等下一rAF的证据。保留8步防螺旋上限、single-in-flight与暂停屏障；本轮不改调度。
- PackedVisualState 的 point/puff schema 均为固定8个数值载荷，但编码仍循环字段、判断类型。此前CPU诊断 record/dataValue 热点仅定位，不证明新方案收益。已有decoder全mask路径，不在本次修改范围。

## 候选
仅将 point/puff 编码的 schema 分派展开为固定字段调用，仍按原顺序逐字段读取 enumerable、拒绝getter、验证Vector2键数与坐标类型、检查所有未知键、预算与身份。缺失/undefined/null仍使用原2-bit mask，任何扩展仍整集合回退图路径。保持同一wire顺序、ID分配、数值精度，读取期间的Proxy副作用与异常顺序不能变化。不是对象池、slot目录或缓存重跑。

## 验收
先冻结完整Host依赖与原始文件字节，完成后一次typecheck/lint/既有render-projection（加入专项合同），再按performance-gate.json固定两次平衡角色互换。全包/显示/权威与隐藏火控/RNG保持。任一保留门槛失败就精确回退，不重跑择优。完整Host交付不是网络ping或input-to-photon。
