# 舰体插件实现记录 — 2026-09-16

## 范围

实现普通安装（非 S-mod）效果。可外装插件从 6 项扩展为 17 项；另实现既有内置 hbi 的 OP 效果。phasefield / delicate 仍明确标注为元数据，未宣称支持战役传感器、后勤、全部原版插件或 S-mod。

新增 11 项：敏捷护盾、扩展护盾、重型装甲、辅助推进器、高级炮塔陀螺仪、先进光学器件、炮塔装甲、自动修复单元、扩展弹仓、扩展发射架、附加幅能线圈。
已有 6 项沿用并统一：目标定位系统、专注型目标锁定核心、稳定护盾、强化护盾、幅散管道扩容、幅能配送器。
内置：先进目标定位核心（已有）、重弹集成（本次生效，大型实弹武器 −10 OP）。

## 原版依据

- starsector-core/data/hullmods/hull_mods.csv：名称、费用、分类、图标、脚本 ID。按带引号的多行 CSV 读取，仅提取选定项目，未运行内容/资源导入器。
- starsector-core/data/hullmods/{AcceleratedShieldEmitter,ExtendedShieldEmitter,HeavyArmor,AuxiliaryThrusters,AdvancedTurretGyros,AdvancedOptics,ArmoredWeapons,AutomatedRepairUnit,ExpandedMagazines,ExpandedMissileRacks,FluxCoilAdjunct}.java：普通插件实际生效代码，不采用已注释旧代码或 S-mod 分支。
- decompiled/starfarer_api_source/com/fs/starfarer/api/impl/hullmods/HeavyBallisticsIntegration.java：大型实弹 OP −10。
- decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/o0OO.java:860–988：射程与弹药加成。武器 A/if.java:816 等确认射程为 base × percent/mult + flat；先进光学的 +200 不受目标定位百分比二次放大。A/if.java:196 等确认弹药容量采用整数截断。

普通重型装甲无机动惩罚；扩展弹仓不提高弹药恢复；扩展发射架无射速惩罚；炮塔装甲不附加 S-mod 射速加成；炮塔装甲的转速惩罚作用于非光束转速通道。

## 结构与接入

- engine/extensions/HullMods.ts + native-hullmod-metadata.json 是定义、说明、OP、适用/互斥规则及效果的共享来源。改装界面不再维护可安装 ID 白名单或复制效果判断。
- Ship.spec 保持原始配置；Ship.hullStats 是构造时派生数值。保存设计不写入装甲、容量或机动加成，重复评估/出击不重复累加。
- ShipWeaponControlSystem 始终从 contentRegistry 原始武器派生每舰规格，覆盖真实弹药上限、炮塔转速和散布参数；不修改公共武器定义。射程仅经 WeaponRange 计算一次。
- 护盾插件进入 Shield 的真实展开/转向速度与最大碰撞弧度；装甲进入 ArmorGrid；机动进入 ShipMotion；耐久在武器初始化前应用；维修进入既有武器/引擎修复计时。
- OP 总预算、选购可负担判断、排序、列表和详情均采用有效武器 OP；内置武器不收取可拆卸装备费用。
- 装甲、幅能、护盾与武器详情预览读取有效数值；战斗幅能 HUD、系统耗能和舰船资料同步更新。舰队存档弹药校验使用改装后的上限。
- 改装、内容注册与战斗构造共享适用性/冲突/重复校验；内置插件不能重复外装或卸除。未知 OP 数据报错，不默认为免费。
- 新增相同效果类型的插件只需注册定义/元数据，不需增加 UI 特判；全新游戏机制仍须实现对应战斗效果接口，不能仅登记名称就宣称支持。

## 验证

- 29 项内存回归通过：全部当前舰船与标准方案构造、各舰级加成、装甲叠加、容量、维持费、排幅、承伤、真实护盾展开/转向、盾弧上限、相位/无盾限制、互斥、重复/内置校验、光束射程顺序、转速叠加、弹药取整、无限弹药、无虚构恢复/射速加成、后坐力、武器耐久、真实机动、无普通重甲惩罚、真实武器/引擎维修、HBI、预算、缺失 OP、序列化与重复构造、卸装、舰队存档、registry 不变性。
- npm run typecheck / npm run lint / npm run build 通过。
- 4173 正式包隔离浏览器：安装 10 项组合 → 武器详情 → 保存 → 刷新恢复 → 开始模拟 → 返回改装 → 卸载；同时验证厄运不可安装普通护盾插件。17 项列表图标均正常。
- 典范组合（重型装甲+炮塔装甲、附加幅能线圈、扩展弹仓等）：预览与真实战斗均为装甲 2200、容量 28000、自动脉冲弹药 45、敏捷护盾展开倍率 2、维修时间倍率 .5。原始配置容量仍 25000；卸载装甲/容量插件后预览恢复装甲 1500、容量 25000。
- 中途另一个构建替换 dist，旧页面请求旧 CombatView chunk 出现一次 404；刷新加载同一当前构建后完整试战通过，无运行时错误。
- 验证上下文已关闭；用户既有视觉实验页面保持不变。未新增测试文件，未修改原版游戏文件，未进行资源哈希或大小审计。

### 最后一次工作区复核

上述正式包构建、29 项回归和浏览器试战完成后，并行任务继续改动 DesignModel/StudioApp，新增了对 engine/data/generated/refit-source.json 和 studio/NativeCatalog 的引用。在本轮最后复核时两个目标文件尚未出现，npm run typecheck 因 TS2307 暂未通过；未回退、覆盖或伪造另一任务正在生成的目录。此前本轮构建及浏览器验证结论保留，但不等于并行修改后的工作区已再次完成全量验证。
