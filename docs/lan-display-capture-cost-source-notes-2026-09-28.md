# 默认联机采集：静态规格签名与装甲复制审计（2026-09-28）

上一轮增量火控候选已否决并逐 SHA 恢复，产生了改变下一行动的有效证据（progress）。没有活测试或服务需要等待。本轮改查真实默认 display-v1 捕获链，不复活已失败的挂点值行或编码循环重排。

原版 0.98a-RC8 ArmorGridAPI.java:11–36 保留逐格 float 数值及整个格网，不允许稀疏丢格、量化或降低同步精度。网络签名/打包是 Web 传输层，不对应原版玩法变更；原版实机/UI 不在本次范围。当前 Web captureLanDisplayCombat 始终产生完整自包含帧，mutable/custom 路径不得使用不可变证明。

两个待量化点：
1. AuthorityCombatSnapshot 在每帧内已按 spec 对象去重，但每帧仍 JSON.stringify 规格，以内容去重多个不同身份的等值规格。观察不可变注册覆盖、同一对象的复查次数、字符量和调用耗时。不在生产中缓存签名；若后续实施，需先证明无 toJSON/函数/稀疏数组/原型自定义行为，不能仅靠冻结对象推断 JSON 无副作用。
2. LanShipProjection 每帧 armor.copyCells，随后 pack 再 PackedSnapshotNumbers.capture。现有 ArmorReplication 在普通权威组件上能复用，但 display-v1 投影成 plain armor 后未走该路径。观察格数/字节、revision 稳定性、已暴露 storage 比例与复制次数，不提前授予新 DTO 许可。

只在冻结 bundle 中插桩原方法体，保留方法身份；不替换原回调/结果、不用于作战或快照决策。真实 host init，2玩家20AI、三舰、seed917/3200DP，全部已有实验显式关闭。参考及观察推进相同270完整五段（simulation/capture/encode/decode/apply）；逐帧二进制摘要及末态权威+隐藏 RNG/tracker、接收图必须相同。150步自然热身、120步观察；最后120步单次CPU采样仅归因、不当作计时A/B。

观察组时间含插桩/Profiler，不能用它与参考组比快慢。没有候选、没有ABBA、没有浏览器/桌面/发布。基线/源/资产冻结，当前工作树漂移另列，不覆盖其他任务。
