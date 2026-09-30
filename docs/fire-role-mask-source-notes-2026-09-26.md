# 原生火控单扫描角色掩码：修改前对照（2026-09-26）

## 来源与选题

重新读取本机0.98a-RC8反编译starfarer_obf/com/fs/starfarer/combat/ai/private.java:239–269：舰船候选按PD_ONLY、ANTI_FTR、STRIKE、USE_VS_FRIGATES、有限弹药导弹和穿战机等条件筛选，再做射程/预测/射界等检查。存在反编译类型异常，不照搬。沿用现有Web规则，不新增原版UI/实机等价声明，不操作桌面。

近期真实Worker样本中canTarget仍有self约54ms/60tick；这是定位，不是收益预测。已查历史：正式aim复用预瞄空间索引、目标半径Map、拆分canTarget/包装记录等均已试过，不能原样重做。本块不是那些方案：减少同一挂点遍历每艘敌舰时对相同角色hint/弹药/武器属性的重复判定。

## 生命周期与候选

仅qualifiedFireTargets所证明的Worker私有原生名单，在其租约仍active时可使用扫描内角色mask。每次preAim/aim扫描独立，第一次实际合格SHIP候选才求值，之后按FIGHTER/FRIGATE/其它三类读取许可位。不跨挂点/扫描/tick缓存，不新增Map或全局池。preAim显式currentTarget、aim现有tracker及MISSILE仍保留原路径；generic/复制/外来名单及close/长度失效后仍按原顺序逐次读取角色条件。

ShipWeaponControlSystem在完整运动/系统/维修后建立batch，在同步挂点瞄准阶段只改瞄准/跟踪/请求，finally.close后才发射。私有输入来自数据命令，不允许可执行插件或任意getter在该事务内修改hint/ammo。现有所有权约定不是同realm恶意脚本沙箱，加入Worker插件前必须重新审计。

完整live guard、最初targets的逐舰资格、每目标资格租约、阵营/存活/可见性/碰撞资格、精确距离/拦截/射界/碰撞/排序/RNG/decide均保留。不降低频率、精度、实体数、字段或真实校验。

## 验证与预先门槛

两控制器共享同一Ship/Vector2 realm，用冻结旧Autofire比较preAim/aim/decide/跟踪器及RNG。覆盖角色组合、三类船体、导弹/诱饵、无限/有限/NaN弹药、穿战机、跨扫描修改、关闭/名单复制、通用动态getter与重入；测试构建统计mask调用和原角色判断数，正式构建无插桩。

完成后一次typecheck、改动lint、完整既有combat-ai；仅具体失败定向修复。因上轮A/A证明单组Worker可产生约4%差异，本轮预先固定两个真实Host配对：先旧作baseline，再新作baseline，均六排列平衡，每次serial/before为同码独立实例控制。所有三实例都纳入汇总，不取最好值。两逻辑配对均需模拟/交付改善，汇总改善至少5%且超过两次同码控制的最大绝对差异1个百分点，两配对交付P95不增加；完整语义通过才保留。性能门槛已保存于performance-gate.json，不据结果修改或重抽样。未通过则按SHA精确撤回。

## 集中正确性检查

TypeScript exit0（18846ms），4文件lint exit0（122ms）。首次完整既有combat-ai的前52项通过，新第53项夹具把Onslaught舰装与fighter舰级同时送入构造器，被合法的targetingunit费用校验拒绝；并非生产候选行为差异。改为先原生构造再赋测试船体元数据，只复查新场景；其后自建copied-list假batch遇到有效射击解时缺queryBlockers，补齐真实转发后仅复查该场景通过。未重跑前52项、未重复typecheck，保留两次失败日志，不声称首次整条命令exit0。

最终新场景41,097断言，40,960角色矩阵比较、36次完整preAim/aim/decide/跟踪器/RNG状态对照。mask全拒绝0值正确复用；close/长度变化撤销、普通/复制名单和动态hint getter读取顺序保持。计数仅测试构建：整体43,477次mask查询、4,160次编译；矩阵含新端重复查询，不能直接将两端计数相除充当同工作量速度。正式两次测量均无mask插桩。

## 最终结论

两次预定角色互换未给出可重复收益：模拟−1.396% / +1.651%，交付−0.800% / +0.664%，两次交付P95均增加。汇总不满足预写5%与同码控制余量门槛，已按SHA精确回退三份修改文件并归档新增helper；320模块与本轮baseline完全一致。此前有效改动及六排列基准工具保留。详见fire-role-mask-performance-2026-09-26.md。
