# 开放市场资源补货原版对照（编码前，2026-09-20）

## 来源与当前缺口

- 原版0.98a-RC8，BaseSubmarketPlugin.java:48-50,89-94：初始资源计时31天，每次advance把convertToDays(amount)按float累加。OpenMarketPlugin.java:44-48：**进入交互前**以累计天数转秒刷新资源，随后计时清零；不是每帧补满货物。
- OpenMarketPlugin.java:93-130：上限来自实际available、maxSupply、maxDemand、全球shipping；先截断基础上限，再乘由marketId/submarketId/月种子产生的0.9..1.1系数、0.25+0.75*stability/10，再截断。DEFICIT常量为-0.2，而表达式是减它，故缺口项实际增加上限；不能凭直觉改正。
- BaseSubmarketPlugin.java:694-781：跳过nonecon/meta；合法品低于限额按limit/30补充，高于限额按(current-limit)*2/30减少并钳至限额。违禁品只走超额减少，不能立即清空全部，也不能补货。Open分支不启用shortage-countering。
- CargoData.java:606-736：资源增加/移除保留float；新栈不足1不会创建，移除后不足1会删除；原生unlimited单栈最大1,000,000。量化/多栈合并需要区别，当前数字字典只承诺单栈范围，不把>1,000,000合并库存冒充全栈精度一致。
- 现有市场快照由system发布、同tick报价；产业/运输/准入实时解析尚未完整。只靠改asOfTick会造假，本轮保持该保护。
- 已有原版货舱截图和用户星图只可证明已有布局，不能证明市场库存时间变化；本轮不改UI、不操作原版实机窗口。规则来源用源码和Java方法对照，不称为市场视觉验收。

## 实施合同

1. 新增可替换retail provider：独立扩展保存市场/子市场资源计时，初始计时必须由system显式capture提供（新建原版子市场可提供源码31天，旧库存不隐式补31）。capture不可覆盖已存在的计时。
2. 接入world.advance：按固定权威帧推进计时，在同一事务保存；只加计时，不动零售库存/价格/asOfTick。无retail状态的现有世界没有伪造初始化。
3. system-only资源刷新：必须匹配当前市场快照、计时、市场实体和日历版本；消费当tick的已解析供需/运输/稳定度，原价和入港许可不重算也不伪更新。严格要求覆盖当前经济商品名册并使用快照里的违禁品判定。该输入桥仍须未来真实经济解析器调用，不能把它说成已运行全经济。
4. 刷新零售库存与计时清零原子落地；客户端/玩家HTTP不能调用capture/refresh。多玩家共享同一个子市场库存/计时，不能各自进港重刷一份货。
5. 验证原版Java上限+资源刷新方法、float帧计时、库存小数/违禁品/非经济品、存储回滚、跨重启、版本冲突、system权限、真实Worker+HTTP不可越权。全套回归及类型检查。UI不变。

## 接线审计补充：所有权与原子时间推进

现有Kernel仅允许命令provider写自身扩展，因此retail刷新不能直接写market快照，simulation也不能保存retail计时。不能删掉EXTENSION_OWNER保护。方案：由扩展所属provider在锁定元数据里显式声明extensionWriteGrants（写方service、必须capabilities、精确commands）；Kernel仅对system主体、被选中写方且符合授权的精确命令允许委托写。无授权/玩家/错命令/错服务/错能力仍拒绝；授权进入规则锁，变化不自动接受旧存档。此项为Web联机模块合同，不冒称原版游戏机制。

另，原版随机种子使用submarket.getSpecId()，不一定等于Web索引别名；capture额外要求保存明确specId，不能用别名猜测。retail帧更新放在当帧舰队规则之后，保证舰队读取的tick-start视图中计时atTick与world.clock一致。

结果与未完成边界见 campaign-open-retail-progress-2026-09-20.md。未操作原版实机窗口。
