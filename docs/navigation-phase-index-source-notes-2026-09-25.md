# 原生AI导航候选索引：编码前来源与边界（2026-09-25）

上一目标回合属于实质进展：共享控制邮箱生产实现和真实页面验收完成，忙时控制采样提交p95改善；总优化目标继续active。当前重新读取AGENTS、现有源码/剖析/失败候选，未启动子代理或可见窗口。

## 原版证据与本轮预期

本机0.98a-RC8。重新读取`CombatEntityAPI.java:16–32`的位置、速度、朝向和碰撞半径接口，`BasicEngineAI.java:22–23,46–64`的desiredFacing/desiredHeading分离，以及`WeaponGroup.java:301–314`的逐武器推进。当前Web TacticalNavigation明确是Web策略而非完整原版BasicShipAI；本轮不改其策略、lookahead、8段积分、候选速度顺序、几何和RNG，不声称原版等价。无UI变动，无原版实机/视觉验证。

## 当前证据与选择

既有真实Worker脚本200 Onslaught、120预热+120步，默认parallel分支CPU剖析：hasOwnedFireControlReadHooks self421.9ms/total454.6ms；obstacles self305.3ms/total509.0ms；outsideAcquisition self228.8ms；captureGraph total1921.5ms。包含GC且inclusive不可相加，仅用于选方向，不是无profiler性能结果。图冻结于`artifacts/simulation-query-geometry-20260925/baseline-sources.json`。

火控逐舰资格检查仍有成本，但不能因其贵就删除验证。此次选择导航全名单扫描：原生AI阶段已有phaseShips、WeaponThreatEnvelope和逐AI失效边界；运动/发射/teleport activation effects在该阶段之后推进。普通/扩展引擎仍可能提供动态读者，不能分享位置快照。

## 方案与失效

- 只在显式登记、私有数据命令Worker且已有完整原生AI阶段门槛通过时提供索引；小于64舰、owner依赖记录器、普通mutable/inline、未知钩子/多核提交路径不进入。复用现有所有权登记，不接受DTO开关。
- 每原生AI阶段惰性建立按X排序的舰船位置索引；只存会员顺序/位置及全局保守半径/速度上界，不保存死亡、相位、友敌或可见性。查询结果恢复原舰序；小行星继续原扫描。
- 对查询的欧氏距离门槛用每舰半径上界+L1速度上界构造更宽的坐标范围；包含坐标尺度舍入余量，非有限、负视界、溢出一律回退全扫描。近处目标继续原函数/原算式；不近似risk，不改变积分数。
- 每AI update之后刷新该舰保守上界；如果位置改变，索引整个剩余阶段关闭，不能用旧排序。阶段finally关闭；名单identity/length失配回退。初次查询之前没有数据缓存。
- Observer带noteNavigationObstacle、覆盖原distanceTo/length或motion reader时继续原路径。索引是内部只读域，不是同realm恶意修改的安全沙箱；未来Worker若允许函数插件需撤销所有权或重审。

## 集中验证计划

扩展既有simulation-hotpaths：原名单数学接纳集必须是索引结果子集（顺序保留）、确定边界/极值/非有限回退、临时phase/shield变化、刷新和close、普通engine不授予、未知hooks/owner观察器走旧路径；真实固定步默认Worker与冻结前版本逐tick比较完整显示/权威/隐藏火控/RNG。集中类型、改动lint、该既有场景；无profiler做一次200舰330tick配对，性能不合格则恢复候选，保留证据，不反复抽样找好数字。

## 实现后复核与定向修复

完成集中类型检查/改动lint/既有simulation-hotpaths后，首轮200舰330tick配对完整状态通过。收尾兼容性复核补充了未提供索引的自定义distanceTo访问器：新路径在判定可用性时多读取一次（113次而非旧112次），独立重现失败于`generic-reader-failure.log`。

修复为先确认受控索引存在，再检查原生数学读者；普通引擎不新增该访问。增加零作为全局半径下界，严格覆盖“未激活护盾贡献0”的原表达式；合法舰体在ContentValidation.ts:313–315本已要求collisionRadius≥0.000001，但索引数学合同也覆盖负数异常输入。仅定向lint和原场景复查，最终2194断言通过（新索引1607，其中257组确实剪枝）。不删掉失败记录。

原生阶段的来源补核：ShipSystem.ts:152–169 activate只记录pending事件/状态；174–180 dispatchEvents才调用onActivate/onActive/onAdvance，与WeaponThreatEnvelope既有阶段说明一致。索引存位置；shield/phase/目标资格仍逐候选读当前值。生产参数传递覆盖本地与LAN共用CombatEngine，但本轮计时是本地真实Worker，不冒充LAN relay/显示结果。

因此需要对修复后的精确源码定向复跑200舰配对，保存到新的paired-200-compat-fix与final-sources.json；不是根据速度挑重测。初始candidate-sources.json与首次性能样本全部保留，最终验收只引用最后通过的实现。测试专用--navigation-audit短3tick证明Worker真的创建/查询/关闭索引，其插桩时间不作为性能结果。
