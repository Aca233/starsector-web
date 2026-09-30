# LAN快照遍历：来源、定位与候选边界（2026-09-25）

本轮起点包含已经验收的LAN主机火控登记。只在后台工作，无子代理、可见窗口、输入事件fixture、提交或发布。

## 来源与原版边界
再次阅读本机0.98a-RC8：starsector-core/data/weapons/amblaster.wpn:1–28（贴图/颜色/挂点/粒子/音效），decompiled/starfarer_api_source/com/fs/starfarer/api/loading/WeaponSpecAPI.java:19–45（动态元数据及setter），api/combat/ShipSystemSpecAPI.java:22–29（依赖stats的range/cooldown/regen/uses）。传输必须保留现有全部字段、精度及读取顺序；原版没有这一Web网络编解码层。本轮不改UI/原版规则，原版实机/画面对照未做。

## 先定位，不重复已否决路线
已有CPU场景：64舰、2 Onslaught+62 Hammerhead、seed917，240预热+120测量，LAN默认display-v1/packed numbers/完整binary/decode/apply，500us采样只用于归因。阶段均值：模拟12.43、capture7.24、encode5.45、decode3.10、apply17.10ms。visit/assertDataField/unpackDisplay是接收热点。

进一步核对历史 display-validation-performance-2026-09-25：标量validator分离、guard自有属性分支均已验证无全链路净收益，不能重复做同样的循环重排，也不能删除校验或直接启用改变只读定义契约的display-v2。当前所有采样到的接收record布局也已被现有生成器覆盖。本轮不修改这两个校验器。

## 本次有限候选：编码器消除标量递归分派
BinarySnapshot.mjs 的 fast array 已专门处理数值/null，但布尔/字符串仍回到递归 doEncode；map则对所有值都回到递归分派。对记录字段数组里的静态标量、普通标量header，在当前循环直接执行相同的深度/有限数/字符串合法性检查以及同一个encodeNumber/encodeString/encodeBoolean方法，仅容器/其它对象继续递归。

不是减少校验、缓存可变值、池化逃逸对象或新协议。保持map的两次getter读取、key验证和枚举顺序；depth在读取item和写入key之后按原位置拒绝。保持数组iterator/live-length/洞行为、非法surrogate fallback、数值位宽、SWF2/3、fragment cache和所有权；TapeSoundEncoder的root depth调整仍由其原doEncode执行，子字段已在>=2深度，不绕过该调整。包仍独立拥有buffer。

## 验收预先约定
修改前冻结生产图及CPU程序。扩展既有check-shared-snapshot-codec，比较独立旧编码器（共享PackedSnapshotNumbers模块身份）对边界数值/字符串/布尔/null/undefined、getter两遍读取、Proxy次序、非法类型/字段/深度、重入、tape声效深度及transfer后的字节。集中typecheck/lint/该既有场景。

无profiler的现有64舰完整CPU场景做一次ABBA，每轮240预热+240测量，完整wire哈希及接收对象图保持一致；不只拿编码局部均值宣称FPS收益。若编码或完整流水线没有净改善就撤回本轮生产候选并保留证据，不继续重跑寻找好数字。只有候选可保留才补一个真实Worker配对，所有输入fixture保持关闭。

## 验收更新
候选13项编码检查通过，但一次ABBA中encode均值+1.80%、完整五段+0.43%，无净收益，已恢复BinarySnapshot.mjs。656个非生涯源码与本轮起点完全同hash；上一轮LAN火控登记保持。保留3个回归并定向复查通过。正式结果/限制见 `lan-snapshot-traversal-performance-2026-09-25.md`。没有继续测试同候选以寻找有利样本，也没有声称接收/渲染Worker已迁移。
