# 富勒烯线轴：已安装港口效果与增长桥接（2026-09-20）

实现前证据见 campaign-fullerene-spool-native-audit-2026-09-20.md。原版 0.98a-RC8；本轮只处理已安装快照的规则，不操作桌面、不用子代理，不提交/推送/打包/发布。

## 实际改动

- 新增 reference-port-items.json / import-campaign-port-items.mjs，记录8份本机来源哈希、原版名称/图标、CSV精确绑定、float32的0.3以及3条限制文案/顺序。--check验证可重复导入。
- 新增 OriginalPortItems 的独立要求检查和 apply/unapply 子阶段。只有spaceport/megaport支持fullerene_spool；planetIsGasGiant必须明确为boolean或null，null只表示原版没有PlanetEntity。禁止用气态巨行星条件名猜行星getter。
- 安装限制使用原版market.hasCondition语义：极端天气/极端构造活动即使未勘测或被抑制仍阻止效果。apply时要求不满足便执行物品unapply；只写/清物品同名flat，保留percent/mult/外部modifier。
- 港口阶段按原版AI→改善→物品→基础流通性顺序写入；停工/新建清掉效果，升级仍可运作。两个港口不叠加线轴，不做引用计数；较后失效港口可以清掉先前港口的同名物品加成。没有安装物品时不擅自清除陈旧物品modifier，卸载必须显式执行unapply生命周期。
- 商品、财务、移民只放行已核实的精确绑定，不把线轴伪造成产量/收入/额外移民回调。实际+0.3通过产业流通性进入人口增长后的重应用。
- 旧本地增长和共享条件增长都要求显式行星getter；条件IDs取自本次真实条件roster。旧combined access拒绝与自身roster冲突的重复上下文；共享路径不重放条件循环。

## 验证完成

- 8个测试文件串行回归 **98/98通过，无跳过**：线轴、常规产业、流通性、财务、扩展与旧移民/人口增长。
- 新增 **240组原版Java港口差分**：抽取真实ItemEffectsRepo匿名apply/unapply、BaseInstallableItemEffect要求检查、BaseIndustry物品子阶段与Spaceport方法；三种行星getter、四种天气组合、两种港口、运作/新建/升级/扰乱、AI/改善、人口先后次序与双港口共享键。
- 新增 **12组原版条件→线轴港口流通性链式差分**，验证共享增长输出与真实原版条件/产业阶段一致。
- 另有12种旧/共享增长组合及明确缺失/多余上下文拒绝测试，原有供需/财务/人口Java探针继续通过。
- 严格类型 tsc -p tsconfig.campaign.json 通过；17个相关文件单线程oxlint无诊断。顺手将类型合约中3条既有未使用表达式/变量警告改为void/下划线变量，保留原先expect-error断言。
- 证据日志（被Git忽略）：artifacts/campaign-port-items-regression.log、campaign-port-items-types.log、campaign-port-items-lint.log。

## 不等于完成的部分

- 原版实机/安装卸载界面/Web视觉及交互验收本轮均未进行；本轮没有UI改动。
- 私有保存捕获中已知线轴现在有对应规则，但尚未从保存对象关系恢复market.getPlanetEntity().isGasGiant；不自动填false，也不把该市场宣称已完成恢复。
- 仍未执行全市场管理员/技能/监听器/经济网络/财务月结/实际库存/世界权威恢复。readyForAuthority=false、Corvus industrySimulation=not-executed、规则锁与发布门槛均不变。
- 生涯总体仍未完成；下一步先核对并恢复真实市场行星getter，再连接完整存档重应用。用户正在使用电脑，原版实机补验等待许可。
