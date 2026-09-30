# LAN v1 结构与重复工作审计（2026-09-26）

## 范围与证据

本轮只审计 Web 自有快照协议和接收所有权，不改变原版玩法、界面、模拟频率或精度，不要求启动原版实机。生产候选尚未建立。

- `src/network/display/LanShipProjection.ts::project` 已用每舰 Map 对同一 system 的展示读数采样一次；不能把它当成待实现优化。但 system/systems/allSystems 仍进入不同 wire 树位置。
- `src/network/DisplaySnapshotCodec.ts::unpackDisplay` 恢复可变目标，保留遗漏字段/本地扩展，逐字段检查 descriptor/原型能力；内容重复不等于目标可共享或可跳过写入。
- `src/network/LanDisplaySnapshot.ts::decodeShips` 恢复每个挂载点后分别校验 weaponSpec 和系统 definitionData；只有 receiver-owned v2 不可变定义可免重复校验。
- `src/network/display/DisplayDefinitionCapture.ts::inspect` 已对可变根逐次读取所有 descriptor/value；同对象地址不是内容版本。
- 既有恢复阶段诊断把主要成本定位在舰船字段恢复和后置校验。上一轮输入额外完整绘制已经否决，本轮不重开。

## 问题与方法（运行前确定）

1. 22/64 舰、2 玩家、seed 917，复用已有 CPU 场景的 onslaught/hammerhead 阵容，真实 fixedUpdate → 默认 v1 capture → binary encode/decode → LAN restore。
2. 只取 tick 240/300/360/480 的结构样本；间隔内仍每个 tick 模拟，每 12 tick 捕获/应用。统计不是时间基准，不能据此给出性能百分比或完整联机结论。
3. 分别统计武器定义、系统定义、其余舰船字段的恢复字段数；定义按保序、区分 undefined/特殊数值的内容签名统计重复量，并记录跨样本同绑定内容变化。
4. 核查系统 wire 重复与接收端对象身份、同内容 mount 的独立根、接收对象可写性。额外一次离线重放验证目标本地字段被覆盖、额外字段保留、挂载点独立；不在权威世界注入改动。
5. 冻结本轮入口和所有构建依赖，记录实际读取资产的 SHA256 并复查未变。输出只描述这些固定场景，不代表所有舰船/模组。
6. 纯诊断工具用小型合同测试验证计数和规范化语义，再运行一次两种规模场景。只做改动文件 lint、编译校验；没有生产修改不反复跑全项目/真实 LAN。

## 判定边界

重复内容数量是优化潜力，不是可以安全删除的工作量，也不对应 CPU 时间占比。对象池不能省去重新恢复/校验；地址缓存不能遮蔽可写目标的变更；冻结目标或开启 v2 需要单独兼容性和全链路门槛。任何新生产候选必须另写预注册门槛，不用此诊断数据补发旧候选通过。

## 完成后的补充

实际已按上述两个规模完成结构和所有权审计，报告见同目录 `lan-v1-structure-audit-2026-09-26.md`。工具后续增加跨采样点定义根身份统计，并纠正普通 `$custom` 字段不应被诊断器当成协议包装的错误。首次夹具字段名错误及所有中间工件保留；未建立或晋升生产候选。
