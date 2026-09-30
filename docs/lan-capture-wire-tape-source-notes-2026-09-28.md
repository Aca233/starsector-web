# LAN 捕获与编码融合候选（2026-09-28）

原版证据：沿用本日 capture-cost source-notes 的 0.98a-RC8 ArmorGridAPI.java:11–36，逐格 float、完整格网不变。本轮只替换 Web 私有传输中间表示，不改玩法/UI、模拟Hz、精度、数量、校验和权限。原版实机/UI 不涉及，实际联机尚待验证。

现状：完整展示图先递归装箱为 Wire，再由编码器递归枚举；上一完整270步采样显示 capture+encode 占总样本约19%，主要不是规格签名或装甲拷贝。方案是 frame-owned flat token arena，普通原生记录和数组在采集递归时直接写入，布局ID仍在子节点处理后分配；特殊叶子/列/粒子/自定义数组保留原pack。编码直接消费arena，内部token不出网络。默认关闭，不启用旧实验。

行为合同：旧 Object.values 采样顺序、函数过滤、数组holes/HasProperty、同构record合并、布局顺序、Ship引用与循环、省略规则、JSON Unicode/unsupported回退、PackedSnapshotNumbers、完整独立旧帧和双声音通道。opaque root 的自有toJSON可物化旧Wire，也令旧通用binary/helper拒绝，避免被误编码成空对象；同tick资格变化必须丢弃保留的opaque capture。

先备份四个已有生产文件；只新增CaptureWireTape两文件。冻结当前源与资产；不覆盖其他任务。门槛与固定一次ABBA见preregistration.json：完整五段热两对各≥3%，冷回退各≤3%，init增量≤max(10ms,10%)。合同通过后才计时；失败精确撤回，不重测挑结果。通过离线才进入后台生产式浏览器验收，离线不能冒充联机完成。
