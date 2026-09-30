# 火控扫描临时记录复用：修改前来源与边界（2026-09-25）

## 原版证据 → 预期行为
本机0.98a-RC8，修改前重新阅读 decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:233–282：逐候选检查阵营、可攻击性、可见性、武器角色、距离、预测和射界，指定目标优先；以及 combat/systems/WeaponGroup.java:301–314：逐武器advance并独立shouldFire。反编译中有类型异常，不照搬异常表达式，也不声称Web的选敌算法已与原版完全等价。

本轮不修改任何玩法/UI和上述筛选/射击条件。原版没有Web的FireControlTarget包装记录，当前Web冻结源码及完整状态输出是本轮内存分配等价依据。无需新增界面设计；没有原版实机或截图操作，不把无头测试冒充视觉验收。

## 新鲜证据
当前工作树，真实生产Worker、200 Onslaught，150tick预热 + 90tickCPU采样，独立无头Edge。baseline-sources.json包含298模块，是修改前完整图。

模拟累计采样4401.8ms，ShipWeaponControlSystem.update累计1966.8ms（44.7%），preAim累计998.9ms（22.7%），canTarget累计535.0ms。后两者包含于上层，不能相加。GC采样1112.9ms属于整个被采样Worker，不全归因于模拟或目标分配；profiler结果只定位，不作为性能验收。

## 当前差异 / 本轮候选
preAim.track对每个待检查敌舰创建{kind,entity}；aim在扫描每枚导弹和敌舰时也创建该记录。大量记录最终因角色、状态、射程或几何被拒绝。记录只在canTarget/solveWeaponAim内部被同步读取，未交给扩展回调；preAim只返回point，aim只将成功solution加入候选集。

- preAim每次独立调用拥有一个私有、惰性分配的SHIP探测记录；下一目标仅覆写entity，不跨调用保存。
- aim扫描对SHIP/MISSILE各使用一个私有、惰性探测记录。仅在canTarget失败或solve返回null时允许下一候选复用；成功加入candidates就立即交出所有权，下一候选必须新建记录。
- 已返回/候选排序/跟踪器持有的target不得再覆写。原current target判定仍使用既有记录；不改变tracker/RNG、排序、名单顺序、读取/回调顺序、更新频率、精度、数量或开火许可。
- 所有读取仍实时执行，包括自定义getter/回调；不缓存target状态，不修正/开启此前被否决的batch资格、范围树或放宽任何保护。
- 可重入调用有自己的局部探测记录，不能覆盖外层记录。异常照常传播，不存在跨调用共享scratch池。

## 验证
扩展既有check-combat-ai，在同一类模块图中可选导入冻结旧AutofireController；覆盖多目标成功/失败交错、已返回目标跨后续扫描保持身份、导弹/舰船混扫、动态getter顺序、指定目标与预瞄，以及可重入读取。集中一次typecheck、改动文件lint和该既有场景。

用既有真实Worker --decode基准，200舰、150预热+180测量、交替旧串行/旧默认/新默认；每tick数据包/显示图/隐藏状态对照，独立报告模拟均值/P95和Worker往返+解码。不以减少对象数量宣称提速，整步无收益则撤回候选并保留失败证据。测试不并发运行，不发布、提交或替换安装内容。
