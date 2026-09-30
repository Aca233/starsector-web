# 封闭Worker帧内HUD单次投影：来源与语义（2026-09-26）

## 原版证据
本机0.98a：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8–9位置/速度、59船体值，ShipAPI.java:336相位等是当前状态接口。Web私有显示编码不存在原版算法对应，以当前完整Web呈现图为等价基线。不调整HUD结构/内容、频率、精度、显示实体；不操作桌面，不宣称新增原版UI或实机验收。

## 采样与当前差异
worker-allocation-profile-20260926/heap-summary.json两条captureDelta→hud.capture→captureView→map→contact路径self约14.54MB和9.68MB/60tick（统计估计，非保留堆）。同一Ship在player/weapon/target/ships/capitalShips/fighters/bombers中重复填充同一个WeakMap显示记录。LAN已有captureReadonly：同capture按Ship身份去重，保留数组槽位及已有别名；LocalWorker Encoder尚未使用。不重试已否决的graph shape缓存或scalar候选。

## 候选和行为边界
只改CombatPresentationEncoder：FireControlQueryRoster已登记的封闭Worker域，且现有RenderShipProjection.supports全帧校验通过之后，使用现有HUD captureReadonly；公开可变引擎、UI保留旧路径。Worker仅收数据命令，不导出可变Ship/原型/函数，不把此登记当same-realm安全沙箱。Ship/System本机构造字段、Registry已审计定义、NativePhaseReaders和纯查询限制不变。
核查ShipSystem.activationFailureReason、Registry nativeStatDefinitions/originalStatDefinitions、HullPortraitView只读轮廓/装甲副本、Ship的显示getter，以及原生statusText/canActivate/selectTarget：它们读取舰体/挂点/目标/生命周期，不推进模拟/RNG/资源。DroneLauncher/Mote的懒状态访问不因重复调用推进时间。未知系统/相位回调仍被原supports拒绝；普通自定义getter引擎不登记，按原次序重复读取。
只减少同次capture同身份的重复投影，不合并同id不同对象、不跨capture/tick缓存值。细节等级由固定player/target/weapon对象决定；每次新调用（包括同tick）重新采样。旗舰、目标、手动模块、装甲、弹药、相位变化即时反映。所有图字段/检查/传输保留。

## 基线变更与验证
冻结前发现并发舰装工作更改ModManager、GlorianaPack、DesignModel，新增GlorianaArmory及其JSON。保留它们，通过build-only重新冻结当前315模块，不复用过期313模块；incoming-workspace-changes.json记录来源，未启动额外测速。
新合同加入既有render-projection：冻结旧Encoder同模块图逐包和有效字节比较；原生/相位/模块/航母、重复名单、目标/模块切换、同tick变化、同id换实例、公开getter/异常和失败epoch。测试计数证明每源身份一遍，不当提速。
集中一次typecheck、改动文件lint、既有render-projection；独立默认200舰55tick确认真实Worker和恢复路径；再一次200舰150预热+180测量的LocalWorkerHost固定串行配对，无profile/stages。不删负收益区段、不择优重测，无净收益精确回退。
