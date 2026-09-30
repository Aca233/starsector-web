# Owner只读观察协议：修改前来源与验收边界（2026-09-25）

## 原版与当前行为
本机已核实0.98a-RC8；本轮重读decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8–9 getLocation/getVelocity、WeaponAPI.java:158 getCurrAngle/185 getLocation、ShipAPI.java:329 getWeaponGroupsCopy。这些是实时数据接口，不支持跨步省略动态字段。本轮不改原版玩法/UI、实体/频率/精度/发射次序，无原版可见实机验证，也不占用桌面。

## 现有证据和拟实现
artifacts/worker-cost-breakdown-20260925/breakdown.json的19个owner批次内，worldEncode约2.919ms、syncMax约3.397ms；这是旧分段定位证据，不是本轮收益预测。当前Protocol.encode与Owner.apply仍通过shipPaths/mountPaths的字符串数组逐项readPath/writePath。自有scalar和弹丸字段已有直接访问实现，这组只读世界观察仍是动态路径分派。
拟新增ObservationWire.ts，把相同固定字段顺序展开成直接属性读取/写入/比较。仍经NumericStore/Reader保留number、-0、NaN/Infinity、undefined/null、boolean、string及对象标记；逐字段完整校验，不改SAB、tags、dictionary或协议版本。派生range/DPS/muzzle/vent/motion仍在原位置计算；绝不缓存其动态值。嵌套写入保持reader先读取值、再访问/创建子对象的次序，nullish处理与旧writePath一致。
通用readPath/writePath及公开协议路径表保留；固定协议字段的源定义和展开代码由合同对照，不能只添加字段表而忘记编码/读取/校验。辅助模块只type-import Protocol/Types，不能引入权威Engine加载依赖。

## 验收计划（测量前预先指定）
冻结当前完整源图，修改仅限ObservationWire、Protocol、Owner和测试支持。一块完成后集中typecheck、scoped oxlint、既有combat-ai，加入逐字段编解码、短路/读取顺序、坏值、空嵌套对象、固定旧Publisher对照与LAN derivedWorld完整验证。
速度只测一次200舰、150预热+180tick、固定Owner调度的真实Worker前后配对；新增--owner-pair仅在测试构建绕过成本选择/成本退役，不绕过资格、状态/输入校验、超时、失效回退或完整逐tick序列。保留串行参考臂，明确强制Owner不是默认自动模式，也不能由此宣称多核已优于串行。默认自动模式用短激活/恢复审计确认不变，不将插桩耗时作为提速结论。只有目标发布/同步开销与全步成本支持才保留；否则精确恢复本轮生产候选，保留证据，不择优重跑、不覆盖并发改动。

## 合同夹具修正（2026-09-26）
首次typecheck/lint通过，combat-ai第24项失败：测试用value+1修改无限弹药，Infinity+1仍为Infinity，却期待拒绝。冻结旧Publisher与候选都接受未变值，fixture-failure-oracle.json记录；只改测试数值变更法并assert实际改变。首次添加定向过滤因CRLF锚点未匹配而失败，命令链仍继续，意外重跑前23项；没有伪称该次为定向验证。接着第24项暴露另一个夹具问题：未发射挂点的fireControl为undefined，注入嵌套变更前须临时创建容器并最终还原。两次均未改生产校验逻辑。已修复过滤，从第24项再次定向运行失败及尚未执行尾部，保留所有失败日志。
