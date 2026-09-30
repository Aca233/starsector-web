# 私有Worker武器修饰标量组合（2026-09-27，实现前）

## 证据
当前基底新采样确认combatWeaponRange、combineSystemModifiers仍有显著开销；见lan-post-navigation-diagnosis-result-2026-09-27.md。上轮导航失败已撤回，不重开旧单槽接线/相位数组/逐障碍资格/最大航速标量候选。
本机0.98a-RC8 API源码MutableShipStatsAPI.java:190–198区分射速与各武器类射程stat，MutableStat.java:345 getModifiedValue是标量读取；只作为独立stat的来源，不照搬其内部算法。此次严格以现行ShipSystem.modifiers和Modifiers.combineSystemModifiers为行为基准，不改玩法/UI，不声称原版实机等价。

## 当前差异与方案
六个武器getter（射程百分比、弹速百分比、弹药再生、伤害、射速、耗幅倍率）只读一个武器种类的单字段，却完整组合所有普通/三类武器修饰对象。新候选只折叠该字段，删除无用的combine对象/keys分配；仍调用已审核原定义的modifiers/passiveModifiers/moduleModifiers，实时读取所有生命周期/父舰关系，不跨查询缓存，不提前合并或改变浮点结合顺序。

新独立默认关闭VITE_LAN_SCALAR_WEAPON_MODIFIERS，仅host私有数据命令域init/reinit启用。不修改公开allSystems或旧modifiers。undefined武器类型立即返回原中性值且不读任何callback；非空runtime、未知本舰/aux/父舰定义、自有modifiers/available覆盖、非原生系统原型、父舰自有allSystems继续完整原路径。此为Worker内部所有权约定，不是任意同realm恶意猴补沙箱。
标量折叠必须保留undefined直到最终返回；auxiliary先递归整体计算再与own合并，然后按原parent.allSystems顺序逐项组合。百分比使用(a??0)+b，倍率(a??1)*b；b undefined不运算，保留-0/NaN/Infinity和浮点非结合性。capacity沿辅助链继承原调用值。父舰/模块活性条件、isDead/hullHp/retreat/disabled完全照旧；unknown callback不得部分执行后再回退。

## 预登记验收
固定三舰2玩家+20AI、seed917/3200DP/初始176实体734挂点，三个保留实验A/B均开。一次集中typecheck/两生产文件+脚本lint/相关合同：init/reinit/default真实组合计数；六stat×三类型×全部176实体的动态状态差分；纯组合数学含多辅助链、父舰、IEEE边界与capacity继承；未知callback/异常/覆写/非空runtime原序；60完整步逐项权威+隐藏tracker/RNG相等。
唯一ABBA，各臂独立顺序隐藏Node进程、150热身+120计时固定步，两组整步各至少省3%且四臂终态一致才保留。不降低门槛、不重复择优。只在离线通过后一次既有完整无头联机场景（10秒普通+10秒70ms忙任务、800ms主机停顿ACK和同局重连），冻结源/CSS/资产。过载仍失败则不报稳态Hz/P95。回撤前先核对全部候选hash，再恢复全部before字节。默认不开，不提交/打包/发布。

## 性能失败后的只读归因计划
唯一ABBA整步慢7.21%/9.77%，生产先精确撤回。下一次只在冻结候选副本对六getter顶层资格成功/回退及原因计数，150预热+120步，计数区间不报告耗时，不重复性能验收，不用它挽救候选。检查完整终态hash未变，作为下一行动的依据。

## 最终裁决
五合同通过，唯一ABBA慢7.2078%/9.7671%；两生产文件已hash核对后恢复，完整725模块before一致。非计时归因查询4,018,150次全部成功，不是频繁回退；此证据改变下一行动，不能拿初始108→0替代整步验收。没有浏览器/发布，目标仍active。
