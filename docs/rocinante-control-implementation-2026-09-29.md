# 罗西南特 R1/R2 控制实现与验收

2026-09-29 · **工程规则集成；不是完整可玩舰或独立安装包**。

## 实际接入

- `RocinanteSystems.ts` 注册姿态急转与局部火控两个定义；不注册无正式素材的舰船。普通舰没有controlRole时完全保留既有行为。
- R1按任务书0.1/1.2/0.2/8s与150软幅能执行；ACTIVE转速+80%、角加速度+120%；不写速度矢量。主推/侧推暂停、转向可用；刹车/撤退在系统更新时间前取消，OUT即释放控制与角增益。过载、排散、控制器熄火及死亡退出；取消不退款。
- AI要求明确AXIAL硬挂点与可用弹药/冷却、可达射程、25°–145°误差和安全的1.5s惯性扫掠路径。不会以正前方空闲代替实际漂移安全。受威胁、撤退、航路或避障不启动。
- R2以独立右键系统生命周期保存实例状态：IDLE护航、IN重分配0.3s、ACTIVE压制、OUT重分配0.3s。IN拒绝重复切换；没有共享可变状态，不改WeaponSpec。
- 自动火控只接管明确POINT_DEFENSE内置普通实弹挂点。护航优先可达导弹/战机；压制优先选中合法非战机舰体，目标无效/射程射界不符/被挡时仍使用已有真实遮挡筛选回落。手动组优先，未标记炮、轴炮与鱼雷不接管。
- 分配期间冻结自动PDC待发连射，不额外开火；自然冷却/补弹时钟照常走，不赠弹、不清冷却。过载等禁火会真正取消待发连射，不能暂存一串弹待解除后补发。
- HUD通过既有statusText/passiveStatusText和生产显示包呈现模式与剩余秒数，无新增假光效。纯统计读取获投影准入；扫描世界的AI没有加入exact-threat复用或仅按生命周期缓存的allowlist。
- `controlRole`数据校验：只允许AXIAL/POINT_DEFENSE、真实内置绑定和普通实弹；AXIAL要求HARDPOINT；PDC要求点防能力且不可PD_ONLY（需能压制舰体）。

## 本轮证据

隔离动态端口＋无头Edge，不使用用户5173/5174，不操作桌面。不注册测试舰，使用现有认可资产的无视觉规则派生规格，不称为罗西南特素材。

- 项目typecheck通过。改动文件oxlint退出0；后续修正测试脚本警告，定向lint通过。
- `scripts/check-rocinante-controls.mjs`：主线程69项、真正独立Web Worker中同样69项通过；pageerror=0。
- 范围：成本/完整时间、惯性与角增益、刹车/撤退同帧生效、过载/排散/熄火/死亡取消、零dt计时、两实例、导弹/战机/舰体排序、友机排除、射程/射界/遮挡回落、丢失目标、手动PDC/轴炮、不接管鱼雷、切换不补弹/清冷却、持有/取消burst、无弹拒发、AI安全与拦截优先、角色校验、生产显示包编码解码。
- 既有`check-hull-weapon-depth.mjs`回归通过，包括实际WebGL分层、四方向、设计页、Worker解码和旧路径检查。
- Worker执行的是生产Ship/WeaponControl/Autofire与生产显示编解码，不仅是JSON字段检查；**不等于完整data-command Worker协议、断点恢复或多人验收**。
- 第一次独立Worker测试使用blob脚本，资源相对URL无HTTP基址导致加载失败；改为同源模块worker后通过。没有修改生产资源加载器来掩盖测试入口问题。

可复查：`artifacts/rocinante/control-implementation/check-result.json`、`typecheck.log`、`lint.log`、`lint-followup.log`、`depth-regression.log`与本轮独立baseline/patch。

## 明确保留未完成

没有正式PDC/轨炮/鱼雷数据和贴图、实际挂点坐标、RCS反馈或专属技能音效；R3军械与R4插件未完成。首张舰体图只是候选且alpha和舰艏比例待整理。自然实战、数值平衡、设计页可玩闭环、正式素材、多人及独立包安装均未验证。
