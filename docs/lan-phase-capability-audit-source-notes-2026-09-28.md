# 主机相位能力审计：编码前说明（2026-09-28）

上一轮有实质进展：display静态恢复候选离线ABBA通过，但生产式before/after均在主机启动持续过载；两个实际host Worker字节相同。新候选仍默认关闭。总体目标未完成，没有活跃测量需要续等。

## 原版证据与不变项
本机0.98a-RC8 API源码ShipAPI.java:91/336为getPhaseCloak/isPhased；ShipSystemAPI.java:24/53为isActive/getState。反编译combat/entities/Ship.java:5006–5007直接返回实时phased字段。这里只支持相位必须实时，不能以性能为由冻结帧状态。原版UI/实机本轮不操作、不验证；此次不改任何玩法/UI。

## 新问题与旧失败的区分
旧LAN单槽免数组接线、系统列表单次分配、跨写域相位缓存均已失败，不能直接复活。当前只调查另一个信息：ShipSystem.isPhased每次按available→isActive→definition.phase读取，已注册且深冻结的无phase、无isExecuting定义是否占主要工作量。若是，它们的false来自静态能力而非当前激活/冷却值；未来才可能考虑私有Worker实例的负能力专用读取，未知定义、回调、替换和公共对象仍须原行为。这里**不实施该捷径，也不跳过任何读取**。

## 最小审计
冻结当前非生涯源图、公共资源和实际构建依赖。只在artifact副本源码内插桩，保持捕获的类/方法身份和原短路读取次数/顺序：
- 记录Ship.isPhased上下文及allSystems列表调用数量/槽数。
- 把系统相位的原逻辑拆为等价的三个有序分支；记录停在unavailable/inactive/no-phase或继续原phase计算。
- 只有原生ShipSystem原型、没有own available/isActive/isPhased覆盖、私有已注册纯stat定义、无phase且无isExecuting者计作“可进一步审查的无相位能力”。该计数不是生产运行资格，也不是已经允许跳过公共getter。
- 各150冷步+120热步，2玩家20AI三舰循环，seed917、3200DP，完整simulation/capture/encode/decode/apply。所有五项旧模拟实验、display definitions、额外display布局、presentation/AI/serializer Worker显式false。参考与观察wire逐字、完整authority+隐藏RNG/autofire和receiver图必须一致。
- 不运行性能A/B，不对插桩时间下提速结论、不把调用比例当CPU比例。没有生产修改；无需重复全项目typecheck/lint或浏览器功能失败。

按实际结果判断该方向是否值得实现；所有旁支现有WIP保留，无子代理、桌面、提交/发布或放宽保护。
