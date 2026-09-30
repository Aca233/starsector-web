# 默认 display-v1 接收恢复成本与静态布局覆盖审计（2026-09-28）

本轮从已恢复的生产状态出发，不复活 token tape、不重复已否决的 guard 自有属性快分支或 validator 标量 helper。此前样本显示 apply 占串行五段约20%，但尚不知道目前36个静态恢复布局覆盖多少实际新舰/新字段；先测覆盖，再决定是否值得实施。

原版证据沿用 network-replica-apply 的完整展示字段及本日 ArmorGridAPI.java:11–36 的逐格值约束。本轮不改玩法、UI、原版安装、网络频率、字段/精度/实体数或接收校验。原版实机、真实LAN/Steam和渲染不在本次审计证明范围。

当前 DisplaySnapshotCodec 的 unpackRecord 先按已校验布局找静态函数，否则逐字段动态索引；assertDataField 对每次目标写入完整检查 descriptor/prototype，不能因对象上一帧合法就缓存许可。DisplayDefinition 的 visit 对可写接收对象完整验证，也不能仅按身份略过。先记录静态/通用布局调用和字段量、unpackDisplay的对象目标复用、definition验证的根/节点量和调用内耗时。

冻结当前源码和资源，固定Node v24.13.0、已有五个模拟实验与所有Worker/display definitions实验false。真实host init、2玩家20AI三舰/seed917/3200DP，各270完整五段；一组原参考、一组只在冻结bundle插桩原函数体的观察。观察最后120步单次CPU采样，所有观察计时仅归因不是性能A/B。报文、权威+隐藏RNG/autofire、接收图必须一致；不污染ArmorGrid存储暴露资格。观察与参考各一次，不重复择优。生产文件不改。
