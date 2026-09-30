# 单舰发射前仅几何预瞄索引（实现前，2026-09-27）

## 证据与范围
本机0.98a-RC8；重读 ../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:237–265，原版保持目标可见性/阵营/角色、范围、提前量、射界与指定目标优先。反编译有类型异常，不直接照搬。保留Web全部现有预瞄1.5倍范围、最近目标与原序平局，不称原版等价，不改UI/频率/精度/实体/效果/保护门槛，无原版实机操作。

新四实验基底短冷启动采样：fixedUpdate74.52%、weaponControl23.94%、preAim253.171ms。捕获/编码分别6.53%/3.57%，不是此次最大热点。采样桶有包含关系，不相加、不当A/B。

本候选不恢复失败的authored-fire-query（目标资格/阻挡结果/多系统逐舰检查）或导航索引候选。只将既有PreAimRangeIndex用于**单舰组件更新后、发射前**的瞄准区间。借助上一轮独立写入认证span证明已知读/写闭合，不重新反射全场每个组件，不共享任何canTarget/aim/decide结果。

## 正确性边界
- 必须显式 VITE_AI_INTERLEAVED_PREAIM_BOUNDS=true 且既有 VITE_AI_INTERLEAVED_THREATS=true，私有Worker的owned-interleaved span活跃。根AI exact工厂不提供此权限。原有native queryBatch优先，有它时不建立第二份索引。
- span只认证实际已审计的本舰/父舰/载机更新；未知status/interceptor/armor/flux/advance/系统/相位回调按旧门槛关闭。每次begin检查当前shooter's写/读资格及当前roster身份集合；陌生实体、缺成员、已关闭span回退。
- 新batch在weaponControl已完成弹药/健康/故障伤害/编组处理后创建；只包含pos/vel/半径/盾心偏置。aim/preAim/decide循环会改挂点角度、tracker和请求集，不改任何目标的pos/vel/护盾几何。真正requestWeaponFire/发射在finally关闭后；下一舰重新建立几何，无跨ship.update/tick缓存。
- 不过滤阵营/存活/相位/可见性/武器角色，不标记qualified targets；仅按既有保守速度/半径界排除不可能射程内目标，仍保留原roster顺序。指定目标先按原路径检查；剩余候选继续完整canTarget和精确解算。
- 只为>=4挂点且>=32实体的batch准备，第二次需要预瞄候选时惰性构建。密集窗口及NaN/Infinity/非法速度/范围保持既有index fail-open。第一查询不删减、索引从未降低评估频率。batch的finally和span关闭均使读取失效。
- 这是闭合Worker所有权协议，不支持同realm任意monkeypatch插件。未知可变调用者没有该span；新增Worker插件/引用逃逸必须重新审计。

## 预注册验收
五生产文件（含新增OwnedPreAimRangeBatch）的before字节/不存在状态已记录。集中一次typecheck、改动lint和以下合同：真实176实体734挂点，默认关闭/init/reinit且实际收窄候选；逐挂点近远、偏盾/移动、NaN/Infinity、tie/指定目标；根AI工厂/关闭/陌生名单/未知回调回退，异常finally及发射前关闭；既有60完整fixedUpdate authority+隐藏tracker/RNG逐步差分。禁止空覆盖。

一次顺序独立隐藏Node进程ABBA，每臂150热身+120计时完整fixedUpdate，同seed917、2玩家+20AI三舰循环、3200DP；前四实验两臂均true。两组整步分别至少省3%且完整终态相同才保留。失败核对全部候选hash后精确回撤，新增文件仅删除本候选；不重跑择优、不改门槛。离线通过后一次既有完整CSS/176实体真实浏览器功能检查，10秒普通+10秒70ms输入压力/800ms停顿ACK/同局重连，不用离线替代延迟结论。默认关闭，不提交/发布。

实现细化（验证前）：几何准入绑定factory的原始roster数组身份及长度，不接受复制/重排/替换名单“集合相同”作为许可，避免每舰重新建Set或遍历全场。Engine工厂直接接收同一步已捕获的fireControlWorld.ships，不额外this.ships新数组。私有aim区间禁止修改该数组；close清除绑定。

## 验证中断的预先处理

2026-09-27 10:05后核实没有本项目测试/测速进程；check-1已保存5组完整正确性证据（60步hash、4416逐挂点比较等），ABBA只有A0结果，B1没有完成日志。不能从空stdout断言静态检查退出成功。未见任何候选计时收益前，作废整组未完成计时并保留全部工件；用同一已编译冻结bundle执行**一次完整恢复ABBA**，不跨数分钟中断拼接旧A0，不以结果择优。门槛、实体、150+120步和四实验基底均不变。静态检查补记录明确退出码，既有正确性不重复跑。见 interruption-audit.json。
