# 舰队影响力WASM数值内核：修改前对照（2026-09-26）

## 证据与范围

上一轮render-weapon-journal已否决并逐字回退。本轮重新检查现有源码；Host诊断已表明UI复制/事务管理不是毫秒级主成本，不修改该路径。已有CPU定位中FleetTactics.planFleetTactics inclusive约330.8ms/60tick（包含下级、不是收益）。当前影响力对所有可见观察舰逐个调用两次group.reduce，每舰对重复Vector.distanceTo/norm2和JS对象属性访问；每队仍为O(n²)。此前舰对矩阵和掩护局部标量方案不复活。

本机0.98a-RC8 CombatEntityAPI.java:8/9/30定义位置、速度、碰撞半径。FleetTactics原文件明确是Web启发式而非原版战术复现；本轮不改变公式、目标选择、界面或原版玩法。没有原版实机/视觉新验收。

## 候选

仅在既有封闭Worker拥有权和每次规划live原生hook/数学/向量读取准入通过时，把当前已完成readiness的数值列按名单原顺序打包到私有WASM memory；整段影响力循环在WASM以f64完成。逐观察舰先敌方原序求和，再友方原序求和；每项完整使用原Vector2.norm2缩放公式、reach/gap/衰减公式，不平方距离替代、不改变结合顺序、不用近似或SIMD relaxed-math。所有舰船、每项影响、可见性/资格和权威校验都保留。

公开调用、非原生hook、改写Math/Vector方法、WebAssembly不可用/构造受CSP拒绝、超出有界工作区均回原函数。内存仅复用存储，每次重采全部输入；无舰对缓存或跨帧结果复用，不对消费者暴露WASM memory。WASM编译失败不可影响原模拟可用性；本轮不是GPU或多线程方案。

保留可读.wat源码、生成脚本及确定性生成的TS字节，编译器只放本轮artifacts，不添加运行时/项目安装依赖。修改前冻结源图，候选完整后集中typecheck/lint/既有combat-ai；仅具体失败定向修复。专项对照旧planner、随机/极值/非有限/多队/顺序/指令/public getter与原生回退，测试插桩证明WASM真实触达，正式速度不插桩。

性能预先写performance-gate.json：两次200舰、150预热180测量角色互换、六排列顺序。按轮内比较等权合并相对变化，不再让跨轮速度变化污染原始混合均值。每轮同码控制保留、原始P95与30tick块同时报告。不择优重跑，不降低频率/精度/实体/校验，不碰其他并行内容或发布。
