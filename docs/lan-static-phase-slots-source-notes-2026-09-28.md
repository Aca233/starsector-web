# Worker整组静态无相位能力：编码前方案（2026-09-28）

前轮为progress：最新781源码的完整五段参考/观察一致；热120步29311955个系统相位查询均落在已注册且无phase/isExecuting定义上，14246865次相位系统列表。它只是调用量，不是性能。所有旧失败方案仍撤回，extra display候选默认关。

原版依据重新核对本机0.98a-RC8 ShipAPI.java:91/336、ShipSystemAPI.java:24/53、反编译Ship.java:5006–5007：相位必须实时。此次不改玩法、UI或保护机制；原版实机/UI未验收，无桌面操作。

## 有限新方案
仅在host.worker的封闭data-command所有权初始化后，VITE_LAN_STATIC_PHASE_SLOTS=true时，登记当前引擎构造的原生Ship及其现有原生ShipSystem。普通引擎、后来未登记的实体、未知类/定义/getter/custom array不自动获得权限。host重新init登记新纪元，不把权限按ID传播。

私有WeakMap只保存不可变定义身份和登记时的数组身份/长度，不保存isPhased/isActive/生命周期结果。只覆盖0/1/2个战术槽（当前真实场景完整覆盖），更多槽原路。已注册纯stat定义且无phase/isExecuting才能有负能力证明；相同ID不等于许可。每次查询仍检查当前主槽/防御槽/第二槽对象、定义身份、原生原型及own相位/active/available覆盖；未知替换直接回原路径。数组换引用/改长度也回退，不创建热态临时数组。

Ship.isPhased的parent/dock/retreat/Shield原顺序完全不动；负能力只省去allSystems.some这一支。外部相位Map原序实时遍历、短路和异常不变。公开allSystems仍返回新数组。旧单人workerOwnedPhaseReads分支不启用、不修改。

边界：这是与现有owned运行时一致的封闭数据权限，不是防同realm任意JS篡改的沙箱。登记审核普通数据描述符、原型/数组内建；Worker协议不能创建函数/访问器、修改原型/内建或把readonly definition字段改为访问器，原生内容也不做这些操作。未知公开对象不能因字段相似自动登记；未来若开放可执行Worker插件，必须先撤销/重新设计此权限。仍支持普通数据槽位和definition引用的实时更换；own isPhased/available/isActive或allSystems覆盖会回退。

## 写集与验证门槛
既有仅Ship.ts、host.worker.ts；新增OwnedStaticPhaseSlots.ts。写前字节/SHA备份，失败只核对后回退这三项，保留并发WIP、arkFighter和旧默认关实验。

集中一次typecheck、改动lint及相关合同：初建/重建/default、非owned/new entity/未知getter与自定义数组拒绝、动态槽/定义/own getter替换、有相位和isExecuting能力回退、父舰/护盾/外部效果重入异常、公开列表新鲜身份；60步扰动完整authority+隐藏状态/逐字wire/receiver一致。以非计时observer证明无相位列表减少，不能代替性能门槛。

唯一ABBA：固定Node v24.13.0，当前源/资源冻结，2玩家20AI、三舰循环、seed917、3200DP，150冷步+120热步完整simulation/capture/encode/decode/apply。五项旧模拟实验、extra display、display definitions和所有可选Workers两边false。每对热改善≥3%、冷回退≤3%、init增量≤max(10ms,10%)、全部wire/authority/hidden/receiver相等。失败精确撤回不择优重测；离线通过后仍默认关闭，须生产式完整双浏览器验收才考虑晋升。

## 本轮实现与集中检查

生产写集仍仅两处既有文件和一个新 helper；无新增序列化字段。helper 私有 WeakMap 持有已登记实例、数组身份/长度和冻结定义身份，不持有相位布尔值。每次查询读取当前槽位；未知替换、own reader 覆盖和未登记新实体保留旧路径。

集中检查：TypeScript 全项目检查和三个改动文件 oxlint 均成功；27 个登记合同、21 组 before/after/default-off 回调顺序/返回值/异常对照成功。真实 host 初始化/重建及 60 个扰动步的完整五段链路中，每一步均核对逐字 wire、authority+hidden RNG/autofire 和完整 receiver 图。ArmorGrid 见证没有暴露 cells 或改变 revision。

另一个非计时、冻结源码插桩观察器运行 5 个模拟步：allSystems 创建 895395 → 265845，ShipSystem 相位读取 1292245 → 14660，状态摘要相等；新建但未登记的公开舰船仍走列表路径。此处计数只说明优化被执行，不能代表速度提升。正式 ABBA 使用独立无插桩 bundle，结果单独裁决。
