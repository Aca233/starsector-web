# Worker无临时成员数组相位查询：来源与边界（2026-09-26）

## 原版证据 → 预期行为
本机0.98a：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAPI.java:336 isPhased、391 setPhased；starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:5006直接返回当前phased字段；PhaseCloakStats.java:407–414在IN/ACTIVE设true，OUT依即时level改变，510解除相位。API源码与反编译互证“实时状态”，不授权跨阶段缓存。
本轮不改原版玩法或UI，不做桌面/原版实机验证。Web自身父舰、dock/retreat、Shield相位、系统相位、externalPhaseEffects的顺序、异常和短路语义必须保留。Web独立系统的易伤阶段仍由ShipSystem.isPhased按definition/state/isActive实时计算。

## 当前差异 → 最小优化
Ship.allSystems每读构造[system,...systems.slice(1),defenseSystem]；isPhased每次随后some。真实V8采样定位了该分配热点，见worker-allocation-profile报告，不能据此预告提速。
只在local-combat.worker初始化/新Worker恢复后显式启用本realm的封闭数据命令模式：此入口不接收函数/访问器/原型或导出可变Ship。单战术槽和零战术槽的成员快照必为main、defense；在查询任何system.isPhased之前先抓取两者，保持某个system读取期间替换defense字段的旧快照语义。每次重新读取成员，不缓存相位/许可/生命周期。native Worker内槽字段和数组为普通构造数据，数组内建/原型不由协议修改；不是同realm安全沙箱。非Ship原型、own allSystems覆盖、多战术槽回原allSystems.some。普通外部可变引擎不启用，保留完整getter/slice/迭代器/访问器契约。外部相位Map仍按原迭代器实时读取与短路，包括修改/重入/异常。此优化不是对象池，而是免去这一路不必要的分配。

## 验证
冻结完整旧/新生产图；新增合同并入既有check-gloriana-void：启用前公开自定义路径、启用后多系统/覆盖回退、两成员快照、状态/防御替换、父子模块、外部效果动态变更与异常、递归重入。既有void/collision测试在开启模式下执行。一块完成后集中typecheck、改动文件lint、相关既有场景；另外短Worker默认模式初始化/恢复确认同一入口。只做一次200舰、150预热+180测量的无profile/stages固定串行真实Host配对，完整witness/显示图/权威/隐藏状态验证不变；无净收益精确回退，不择优重测。
