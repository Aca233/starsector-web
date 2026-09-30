# 私有Worker实时武器属性组合程序：实施前（2026-09-27）

上轮采样确认失败stat-span的读域审核联合桶9.1372%，原完整组合函数self4.0639%。不恢复该缓存，也不重试其性能门槛。新方案不保存任何跨查询数值：init只编译已知不可变定义及辅助链的读程序，每次stat查询仍按原回调、原顺序读取实时状态，只省去完整SystemModifiers字典合成与每getter递归资格审核。

## 原版→预期→差异→验证
本机0.98a-RC8 combat/ai/private.java:249–265独立获取武器range/projectileSpeed参与原数学；MutableShipStatsAPI.java:196–198独立stat接口，MutableStat.java:345是带失效标记的getModifiedValue。这里只据此确认接口来源，**不移植Java缓存机制**，数值基准始终是Web当前ShipSystem.modifiers的own→auxiliary右递归→runtime→parent左序及IEEE运算。无UI更改，无原版实机验证。

## 与失败候选的结构区别
- 只在真实host init私有engine中安装非枚举实例读者。普通Ship、默认关闭、外来engine不安装。
- 六个武器getter统一执行实时标量组合；不缓存六个结果，不开每船租约，不逐目标/每getter做反射、Map或整族递归审核。
- 初期编译已知自定义根舰系统链（根舰占前次两getter读取约90.86%）；不修改NONE/原生舰及父模块的读者，避免破坏其已有原生FireControlQueryBatch准入。不是删减这些实体或查询。
- 仅六份现有注册身份可编译：NONE、Eclipse、Edict、HyperionYamato/Jump、Adun；回调仍调用原实现，不复制倍率公式。保留undefined直到原二元fold位置，避免错误的结合、负零和非有限值行为。
- 编译器保存结构而非权威值。技能isActive/effectLevel/cooldown、flux、弹药相关状态每次重新读取；发射和同一步中的变化不需要失效数值缓存。
- 执行许可复用现有owned-interleaved写域：阶段入口复核读者描述符/拓扑一次；所有writer仍保留已有原生校验，未知writer立即随envelope关闭程序域。禁止重新对每个writer的全部family反复审计。scope finally关闭、嵌套撤销；exact-only没有许可。
- 非空runtimeModifiers或父舰/结构不再匹配时仍走原完整getter。未知定义、实例/原型访问器、异常与公开调用保持原路径。只读阶段的资格事实不是任意同realm恶意代码沙箱；内建被准入writer不会改JavaScript描述符，未准入writer不执行快路径。
- 新舰若没有在本init编译仍走原路径；下一epoch重新init重新编译，不伪称覆盖后续全部新舰。当前主负载完整覆盖由实际计数验证。

## 预登记
默认关闭 `VITE_LAN_LIVE_WEAPON_STATS`。四文件写集（一个新增）；备份全部before SHA和当前非campaign源图，不改其它WIP，不提交/发布/原版安装。
整块实现后集中一次typecheck、四文件lint、合同：host init/reinit/default与实际程序覆盖；六字段/三类型、辅助右递归及IEEE；开放域/未知读者/运行时来源/结构变化/异常/嵌套回退；主动技能和发射期间连续实时读取；逐挂点aim/preAim/decide与RNG；既有60步扰动；自然20/270步完整authority+hidden状态。
正确性通过后唯一独立Node A0/B1/B2/A3，各150热身+120无插桩完整fixedUpdate，2玩家20AI三舰/seed917/3200DP；四既有实验两臂同开。**两组各至少省5%**才保留，程序exit=0不替代passesPrescribedGate。失败核对全部写集/备份绝对路径和SHA、归档后精确回退；不再跑浏览器。通过才一次原双无头浏览器完整联机场景，实际传新flag；没有稳态Hz/P95不能声称联机改善。
首次集中检查validation-1：Map的键类型推断导致一项TS错误；真实host init又发现实例覆盖getter触发RenderShipProjection的原生方法身份拒绝，全部候选状态合同未获有效通过，尚未计时。修复不放宽任何投影校验：保留六个原prototype getter，通过ShipSystem私有非枚举程序入口读取；scope外返回undefined并由原getter执行原完整modifiers。写集因此增加ShipSystem.ts，修改前已与本轮baseline SHA核对并追加before备份，共五文件。Map显式声明object键。注册先做描述符形状审核再读取动态属性，避免把初始未知访问器当准入探针调用。v2将重新验证受影响的全部7组合同；未重跑性能。
