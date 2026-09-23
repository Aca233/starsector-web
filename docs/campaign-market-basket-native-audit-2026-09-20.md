# 原版市场篮子结算对照（编码前，2026-09-20）

## 证据与边界
- 目标0.98a-RC8；本机 decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/trade/F.java:665-687 把反向搬运抵消成净买/净卖；715-758 getTransactionValue：买入价逐项float累减，卖出价逐项float累加，关税按买/卖两组绝对值float累加后Math.round一次；净额向零取整后减税。不能逐行收税，也不能先单独要求买入资金充足。
- F.java:1091-1130、Market.java:816-896：各商品调用原市场积分/固定价格，确认前市场贸易影响还未落地；同一篮子不应当通过顺序执行单商品命令来改变下一行价格。V0玩家修正可能有小数，不可先逐行截断再相加。
- F.java:1001-1048：confirm/reset清空买卖草稿，cancel反向恢复两个货舱；已保存的原版货舱截图 native-cargo-ctrl-overload-20260920.jpg 显示左侧整单确认/撤销。用户提供的30979333截图本轮查看为星图，不是市场界面证据。没有原版市场完整UI/悬停证据，故本轮只做可独立验证的权威结算，不改UI、不启动原版窗口。
- 现有市场HTTP已经接入单商品报价/命令（旧市场进度文档开头是历史状态）；经济解析/库存刷新依然缺失，same-tick保护不能去掉。

## 方案
- 增加可替换market.quoteBasket与market.trade-basket，一次命令只针对一个子市场/账户/舰队；1..64条有序净交易行，同商品仅一条，客户端先抵消反向草稿。原版跨多个子市场总确认暂未实现，不冒充完整流程。
- 复用既有积分算法，保留未截断的rawGross，按原版买/卖组float顺序与统一税额求净余额；只检查最终余额，不限制超载购买。
- 所有行在同一权威快照报价；收集完整依赖。执行时重新报价，并原子更新市场/扩展/库存/账户，单一receipt/outbox；任一行拒绝则不保存任何行。
- 多行影响以可选lineId=commodityId区分同一actor/request的各行；旧单行事实保持原身份。经济ledger兼容旧单行身份并接受显式多行身份，不悄悄重写旧账本。
- 独立认证HTTP只读basket报价带worldId/epoch上下文；禁止客户端指定价格、权威principal、经济状态。现有发布快照仍仅system可用。
- 默认规则与provider显式升版，不迁移/修改用户存档。

## 验证
- 抽取F.getTransactionValue原方法，用最小Java环境桩比对买卖组合、V0小数、统一舍入、float累加；这是方法级oracle不是原版整局实机。
- 纯函数、SQLite原子性/幂等/权限/过期版本、经济ledger每行幂等、真实Worker+HTTP双玩家竞态/重试；新功能无视觉变化，不拿HTTP通过宣称UI完成。

实施结果与限制：见 `campaign-market-basket-progress-2026-09-20.md`。Java方法240组对照、真实Worker/HTTP/SQLite验证已完成；UI未修改、原版实机未操作。
