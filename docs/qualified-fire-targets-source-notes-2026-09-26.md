# 同阶段已合格火控名单：修改前对照（2026-09-26）

## 原版/当前证据
重新阅读本机0.98a-RC8反编译private.java:233–282及WeaponGroup.java:301–314：阵营/可见性/可攻击性、武器角色、距离、预测、射界与指定目标顺序仍须保留。反编译存在类型异常，不照搬异常表达式，也不声称原版完全等价。此次不改变玩法、UI、数量、频率、精度或开火许可，无原版可见实机新验收。
此前200舰Host完整测量排除UI快照/日志作为默认场景主瓶颈（合计约0.032ms）；当前既有Worker采样仍指向火控。源码显示FireControlQueryBatch.targets已在当前原生只读事务逐舰建立全部资格和targetStatus，再由每个挂点在遍历同一名单/其范围子集时重复查询同一Map。目标状态从来不是跨帧可缓存的。

## 资格证明与修改范围
只对workerOwned的原生batch新建私有租约并登记自身生成的targets数组及PreAimRangeIndex返回的保序子集。独立轻量模块只type-import Ship，避免新值导入环。WeakMap按名单身份登记，不把普通world.ships、复制/伪造数组或generic batch升级。
租约绑定shooter与原始roster引用/长度，查找成功后才读取额外上下文；每目标仍检查租约存活/原roster长度，close立即失效并清除shooter/roster强引用。只读名单由封闭Worker原生代码创建、内部使用，不交可执行扩展；不新增freeze或改变其数组表示，不允许同realm调用者破坏私有所有权约定来伪造资格，这不是恶意脚本沙箱。
只有从该已审计名单遍历得到的SHIP候选，才省去重复的batch.forShip/canTarget Map查询。最初targets的每舰实际资格读取、每begin的完整live guard、角色/弹药/射程/射界/友伤/发射检查不变；显式currentTarget、tracker.current和MISSILE保持原查询。generic/未登记/复制名单路径仍保留原属性读取和自定义回调顺序。预瞄只是候选筛选，不给发射授权。
只传递本次扫描的租约，不跨帧存目标、几何或命中；保序、RNG、返回点/solution/target身份不变。若关闭/长度变更，退回旧查询，不能沿用关闭前缓存权限。

## 验证计划
在既有check-combat-ai中加入冻结旧AutofireController（同类模块图）对照：owned扫描实质减少canTarget查询，同时逐挂点aim/preAim/decide/tracker/RNG一致；普通名单与generic batch不品牌化；复制/外来名单、错误shooter/roster、close/长度变化失效；目标死亡/相位/隐藏/换队/删除每下一batch重新读取；现有回调/重入用例保留。
完成实现后集中一次typecheck、改动文件oxlint及完整既有AI场景。正式只做一次200舰150预热+180测量，冻结旧/新全图，固定串行并使用production LocalWorkerHost，核对全部有效包/显示/权威/隐藏火控/RNG及journal。不开host-stages/profile/计数作速度证据；默认自动模式短激活审计分开，不计作收益。无净收益按hash精确回退，不择优重测。
