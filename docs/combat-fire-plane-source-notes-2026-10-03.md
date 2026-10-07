# 火控阶段数据编译重写：最小对照（2026-10-03）

## 证据 / 边界
目标原版 0.98a-RC8。本机 C:/starsector-core 与 C:/decompiled 均缺失；未取得本功能相关原版截图，未操作桌面。原版源码/实机/UI 等价均待核实。本块只重写已有 Web 权威只读火控的数据准备，不新增或删除射击规则，不改变 UI、dt、扫描节奏、挂点数或实体数。

当前最终默认源码冻结于 artifacts/combat-fire-control-kernel-20261003/baseline-default.mjs。现版本无原型 monkeypatch 的同一 917/2 玩家/20 AI 重型场景，150 步预热 + 120 步 CPU 采样：整步墙钟 37.78ms、fire-query 11.37ms；采样映射到生成 bundle 的源文件标记，NumericAcquisitionFrame.create 包含约 1.94ms，input 约 0.83ms，scope 自身约 0.38ms。含 profiler 开销，不作为优化 A/B 数字；inclusive 不可相加。

## 原版证据 → 预期 → 差异 → 验证
- 原版证据缺失 → 保留现有 WeaponAcquisitionKernel / AutofireController 的拦截、射界、船体/护盾、目标资格、阻挡、弹药/flux、随机与提交顺序 → 当前阶段重复检查不可变 bounds、每向量重复同一原型方法验证、同一相位状态被多次求值、重复捕获姿态 → 只在登记的私人原生 ShipStepBatch 内编译为共享数值读面，普通/自定义路径保留原序。
- 现有 CombatFireFrame 与 NumericAcquisitionFrame 同阶段拥有重复姿态、回退对象 contacts → 共享一份已捕获 scalar plane，回退树消费原捕获状态，不回读 live → 对照精确快照/RNG及直接回退查询，关闭/非原生/自定义 hook 撤销。
- 每挂点仍调用 scope / input 适配 → 原生实际 plan 绑定舰船 source/row/team 一次，同一帧复用既有挂点角色分类，仍为每个查询准备 live 标量 input；不能跨阶段缓存可变 WeaponSpec、range/speed/ammo或 fire permit → 活跃绑定/引用/关闭守卫 + 既有场景逐步一致。

新开关 VITE_COMBAT_FIRE_PLANE=false 回旧路径；unset 只在已登记私有原生路径使用。旧 stage-kernel 保持最终默认。已失败的跨查询弹道缓存、getter 别名 core、copied motion 不重试。

## 验收
完整块后集中一次 app 类型检查、改动文件 lint、同一个既有重型场景 off/default ABBA 对照（150+120）。精确快照/RNG逐步检查在独立非计时对照中；记录实际编译/共享次数，直接检查捕获姿态回退与关闭。没有本轮浏览器/传输/原版 UI 实机验收；不提交、发布。

实际新 query-input 缓存命中 739/179662（约0.41%），撤掉，不保留额外 WeakMap/对象分配。只复用不可变几何和阶段内原生角色/源范围准备。
