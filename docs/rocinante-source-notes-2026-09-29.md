# 罗西南特号：来源与宿主核对（2026-09-29）

状态：选题已获继续授权；P0参考不完整，P1–P3为可迭代设计。**历史分阶段来源记录。最新进度见任务书§27–28：六PDC安装与R3军械规则已做，仍无完整可玩舰或可安装包。**

用户在三舰推荐后回复“可以”，按首推罗西南特继续。不把该回复记为对具体季数、槽位坐标、数值或新画面的认可。

## 1. 版本与来源可信度

采用方向：《苍穹浩瀚》电视剧中的罗西南特，灰黑装甲、红色标识，拟采用有后装轨道炮的改装构型。**修订：前案把舰艏前伸结构直接认作长炮，证据不足，撤回该部位判断。**下列商品页只确认它是剧集的火星轻型战舰及Eaglemoss模型，并没有确认每个武器型号、季数、性能或长度。不得把商品的32.5 cm模型长度当成原船尺寸，也不先写死“第四季完整版”。小说、早期Tachi/MCRN涂装和影视后期改装不混用。

- 来源页：<https://www.masterreplicas.com/en-us/products/the-expanse-the-rocinante-xl-copy>
- 原出处：Master Replicas销售的Eaglemoss成品模型；参考是衍生模型照片，不是剧集原始CG文件。
- 此次没有取得模型文件、纹理、许可或原作素材再分发权。图片只作为研究引用，不进入运行包。

| 图号 | 图片地址 | 实际查看 | 用途与证据边界 |
| --- | --- | --- | --- |
| R01 | https://www.masterreplicas.com/cdn/shop/products/EXPEN601-The-Expanse-Rocinante-XL-1.jpg?v=1738154560 | 上轮实际查看并向用户展示 | 斜侧视：舰艏前伸结构、外置小炮、棱角外壳和尾部发动机；不能给出正交比例 |
| R02 | https://www.masterreplicas.com/cdn/shop/products/EXPEN601-The-Expanse-Rocinante-XL-2.jpg?v=1738154560 | 上轮实际查看 | 偏顶部视角：纵向比例、两侧炮区、舰艏前伸结构与尾部环形结构；仍有透视 |
| R03 | https://www.masterreplicas.com/cdn/shop/products/EXPEN601-The-Expanse-Rocinante-XL-3.jpg?v=1738154560 | 本轮实际查看 | 正前斜视补核左右炮架与腹面可见炮；不是正后或完整底视图 |

### 不可跳过的区分

1. 舰艏两条平行前伸结构的身份未证实；新查看的TACHI/MCRN标识同人模型也具有它们。**既不能认作一门轨炮的双导轨，更不能认作两门主炮**。后装轨炮需要单独核实。
2. 六门PDC、两具鱼雷发射器、一门后装轨道炮作为候选军械组合，不把模型照片当成每个型号/数量已经逐集核实的证明。
3. 已补R04同人模型腹面、尾部及鱼雷口作者标注近景；仍缺对应剧集版本的文字/画面交叉证据。补到参考视角不等于官方几何、数量和尺寸已确认。
4. 六炮的俯视投影、舰体遮挡和实际出射线是关键风险。腹面炮不能为凑数移到顶面，不能无图生成坐标，也不能把身份不明的舰艏结构烘成火炮再叠活动炮。
5. 整船选择获得继续授权；最终挂点和制作母版仍未冻结。三张模型照片不是P0完整通过证书。

### 本轮检索限制

上轮Fandom相关页面返回安全验证，本轮搜索服务返回失败或与查询无关的内容。这些内容没有作为来源，也没有绕过验证。可访问并实际检查的商品说明及照片见上；后续找到的Sketchfab公开模型与实际查看范围见第6节。未检索成功不等于不存在其他可靠来源。

## 2. 本机原版参照

读取 `../starsector-core/data/hulls/ship_data.csv`。这是本机原版资源记录；未启动原版，也未独立确认其完整发行版本。下表是资源数据，不是Web实战强度结论。

| ID | 结构 | 装甲 | 航速 | 加速/减速 | 容量/耗散 | OP | supplies/rec | 护盾 |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| hound | 2000 | 400 | 180 | 175/100 | 750/100 | 38 | 3 | NONE |
| tempest | 1250 | 200 | 180 | 200/175 | 2500/225 | 50 | 8 | OMNI |
| hammerhead | 5000 | 500 | 90 | 60/40 | 4200/250 | 95 | 10 | FRONT |

用途：猎犬对照无盾生存与机动，暴雨对照高端小舰节奏，锤头作为不应正面长期压过的驱逐舰基准。不把supplies/rec单独声称为完整的部署成本核验，也不按原作米数等比换算战斗数据。

## 3. 当前宿主：已读代码，不等于新舰已经跑通

基线HEAD：`62473a8`；工作区存在大量既有改动，HEAD不能代表全部当前代码。本轮不整理、提交、回滚或覆盖它们。

| 能力 | 已读入口 | 结论 | 本舰需要什么 |
| --- | --- | --- | --- |
| 惯性与独立转向 | `src/engine/simulation/systems/ShipMotion.ts` / `advanceMotionWithStats` | 没有低于限速的无输入阻力；转向不直接旋转速度矢量；显式刹车与超速削减已存在 | 复用，不另造“解耦飞行”特权，不覆盖全局运动 |
| 急转系统 | `src/engine/extensions/ship-systems/Types.ts` | 有转速/角加速度修正、生命周期、AI、独立防御槽和控制约束 | 定义具体急转行为；注意blocksAcceleration也影响刹车，不能随意启用 |
| 自动近防 | `src/engine/ai/AutofireController.ts` / `isPointDefense`、`priority` | 已有PD优先与可达目标筛选 | **没有因本次读取就证明具备舰级实时攻防火控模式**；需要显式、实例级策略入口，不改共享WeaponSpec |
| 弹匣与再装填 | `src/engine/simulation/Weapon.ts` / `maxAmmo`、`ammoRegenPerSec` | 武器支持弹量及再生参数 | 首版将补弹明确为Web弹匣抽象；不宣称有限全舰弹库已实现，不新增假资源条 |
| 固定/转动与承座 | `src/engine/content/ShipSpec.ts`、`WeaponInstallation.ts` | 有挂点运动类别、坐标/射界、承座和前景层 | 只证明字段存在；腹面深度、炮管遮挡和全部旋转姿态尚未验证 |
| 四档同档 | `src/engine/modding/ContentValidation.ts:468–469`、`WeaponCompatibility.ts` | 尺寸相等校验与类型匹配分开 | 7个固定绑定、2个可换候选；固定绑定在UI/存档/编译端需一起验 |
| 固体穿透 | `src/engine/simulation/systems/weapon/TerrainPenetration.ts` | 显式武器opt-in、半径限制、成本、持久扣减存在 | 轨炮可考虑小障碍有限穿透；未跑实际发射，不声称参数填上即验收 |
| 轻目标通行 | `src/engine/simulation/Weapon.ts` | `passThroughMissiles`、`passThroughFightersOnlyWhenDestroyed`等存在 | 区分忽略导弹碰撞与真正拦截；逐类测试，不给无限穿盾 |
| 包与注册 | 现有`HyperionPack.ts`仅作结构线索 | 旧舰存在自己的注册/资源/显示链路，不是新舰完成证明 | 不依赖休伯利安、大和炮或女王号资源先被加载 |

## 4. 已有规则→本舰差异→验证

- 原版运动：已支持惯性 → 本舰差异只能是姿态资源与武器配合 → 先验证急转不增减平移速度、限速与碰撞仍正常。
- 原版PD：自动优先导弹 → 本舰需要玩家有意识选择护航/对舰压制 → 测两模式真实目标差异、手动组边界、两艘罗西南特互不串状态。
- 原版小舰：无盾可存在 → 不添加伪装成“原作”的能量盾或无敌 → 测激光、连续动能、饱和导弹和包夹下的生存。
- 弹体已有生命周期/穿透 → 本舰要定义轴炮与鱼雷的不同终止 → 空射、障碍、盾、战机、友军、安全引信、最后一发分别验证。

## 5. 本轮证据与下一步

已做：三张商品照片记录、R04同人模型七张多视角截图、来源与许可区分、原版CSV核对、相关生产源码阅读、设计任务书、纸面预算核算及六炮分层差异研究。
未做：新舰代码、正式资产、P4运行探针、类型/lint（未改代码）、真实Worker、AI自然实战、多人和独立安装。
下一步核实具体改装期、后装轨炮与最终鱼雷出口，利用已实现的普通实弹腹炮深度支持，再锁母版与安装几何。资料未齐可以推进无视觉规则，但不能用错配图壳让新船出现在目录里。


## 6. 新增多视角研究与宿主渲染差异

详见[结构与六炮安装研究](rocinante-anatomy-and-installation-v01.md)，截图和可复核参数位于`artifacts/rocinante/reference-study/`。以下均为同人，不是官方CG或已获授权的运行资产。

| 编号 | 来源与作者 | 本次实际查看 | 使用边界 |
| --- | --- | --- | --- |
| R04 | [Rocinante — krichwow](https://sketchfab.com/3d-models/rocinante-1553cd046b21485e8a9c082030a0edd4) | 可旋转模型；顶部、底部、侧面、尾部、作者鱼雷口标注；共七张截图 | 模型贴有TACHI/MCRN/158，与目标后期灰黑Roci不同；API不可下载、许可为空，不提取模型/贴图 |
| R05 | [Rocinante — Christian](https://sketchfab.com/3d-models/rocinante-the-expanse-3d251c8c67c84a268140ef70d32dea82) | 仅公开元数据；viewer未加载完成 | 不能称已观察其3D结构；作者说简化版省略起落架 |
| R06 | [Rocinante — Rostenbach](https://sketchfab.com/3d-models/rocinante-886f84cae06645fbad80a12f48163bdd) | 元数据及缩略图，未旋转 | CC BY 4.0、可下载；未下载，不因可下载就当正式素材；原作IP另论 |
| R07 | [MCRN Tachi — Jakub.Vildomec](https://sketchfab.com/3d-models/mcrn-tachi-expanse-tv-show-76fc983ab08c449b9042491a00e621cf) | 仅元数据 | CC BY 4.0；作者声明依据Ryan Dening概念图且含个人发挥，不能混作后期Roci |

R04作者注释“Torpedo tube”指向中央上层前斜面的成对矩形盖板区域。这只支持“该同人作者将此区域解读为鱼雷口”，不证明剧集实际两管的位置、数量或开门动画。已撤回任务书中TORP_01/02的左右舷假设。

| 当前代码证据 | 本舰需要的差异 | 验证方式（尚未执行） |
| --- | --- | --- |
| `WebGLShipPass.ts`先舰体后武器，随后固定前景；HIDDEN跳过绘制 | 腹炮先于自身舰体，不能靠HIDDEN代替深度 | 0/90/180/斜角，炮头转向与被遮住的部分一致 |
| `WebGLCombatRenderer.ts`先shipPass，后projectilePass | 还须处理腹面枪焰/初始弹体/拖尾的本舰遮挡 | 同一发射事件逐帧观察：真实出生→受遮挡→自然露出 |
| `WeaponInstallationRenderer.ts`承座/固定前景 | 局部前景不等于整舰轮廓遮罩 | 不能仅加一张大黑盖片；动态姿态、战损保持一致 |
| `InstalledWeaponArt.tsx`的renderBarrelBelow仅改变炮管与炮座顺序 | 改装页有真正的舰体下层安装及可选内置位 | 腹炮条目始终存在；标记与实体分离，不为可点选把炮画上顶面 |

以上为前一轮的源码差异核对。后一轮已据此完成首版内置实弹炮支持；具体实现/验证边界见第7节，不能把原表当作当前功能仍未修改。


## 7. 后续实现更新

[腹面分层实现与验收](rocinante-depth-implementation-2026-09-29.md)：内容验证、生产发射显示归属、普通实弹下层组合、设计页与Worker字段已接入。四角度真实WebGL、实际Worker解码及相关既有渲染场景通过；正式舰体、六炮几何、玩法、自然实战与单舰安装未完成。

本次确认Web原版舰船/武器注册已由用户移除（`WeaponRegistry.ts`为空，ModManager只注册现有扩展包）；原版CSV仍是外部资源对照，不能据此假设onslaught等ID可在当前Web中生成。测试使用现有正式资产，不恢复被移除内容。


## 8. 舰边鱼雷出口不等于腹面武器（用户补充后核对）

- 实际读取本机`../starsector-core/data/hulls/wolf.ship`并查看`graphics/ships/wolf/wolf_base.png`。WS 005/006是小型导弹硬挂点，位置分别为[11,20]、[11,-19]，朝向0°、总射界5°；这是配置/舰体图核对，不是原版实机开火验收。
- `data/weapons/reaper.wpn`的hardpointOffsets为[10,0]，而turretOffsets为[7,0]；`atropos.wpn`的hardpointOffsets为[8,-4,8,4]。挂点/固定承座位置并不等于每管实际出射位置；由武器炮口偏移得到出口，不需要把挂点本身移到舰外。
- 当前Web的`ShipWeaponControlSystem.fireWeapon`使用舰体旋转后的挂点位置，加按武器朝向旋转后的当前管位偏移，计算真实firePos。舰边发射器按此几何直接出射即可；不因新增腹面支持就增加出舱延迟或隐藏整枚鱼雷。
- 当前BELOW_HULL首版验证明确排除导弹/火箭；本次不放宽限制、不改现有鱼雷行为。将来确需内埋鱼雷口，须独立接舱门/遮挡/推进阶段，不能直接把鱼雷标为现有腹炮类型。
- 已修正任务书此前把全部鱼雷写成“出口→安全距离→点火”的过度概括。罗西南特的两个出口仍需按其对应版本证据定位，不因为野狼存在侧边挂点就臆造罗西南特左右管位。

## 9. R1/R2 控制接入对照（2026-09-29）

- 原版证据：`starsector-core/data/shipsystems/scripts/ManeuveringJetsStats.java` 的 apply/unapply 将转速、角加速度等独立修改/撤销；`decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipCommand.java` 分开 TURN、STRAFE、ACCELERATE、DECELERATE、FIRE 和 TOGGLE_AUTOFIRE。宿主 AutofireController 已以射程、射界、真实遮挡筛选候选，手动组在 ShipWeaponControlSystem 优先。
- Web 改编：R1 不照搬原版机动喷射的平移增益，采用任务书 0.1/1.2/0.2/8s 与 150 软幅能，仅 ACTIVE 提高角运动；刹车、撤退优先结束。R2 的护航/压制及 0.3s 重分配是本舰原创，不声称原版有此模式。
- 实现前缺口（后续实现见控制验收档案）：没有可按挂点指定的实例级自动火控策略；主系统 blockAcceleration 会吞刹车；原生 PD 排序未必把战机排在舰体之前。新增自愿标注的 controlRole，不按船名/武器名推断，不改共享武器 hints。
- 验证：生产 Ship/WeaponControl/Autofire 受控场景与独立 Worker 运行规则；检查成本、运动、取消、暂停、两实例、手动边界、目标与遮挡、投影文字和冷却/弹匣。原版实机与正式罗西南特视觉暂不验（无正式素材），不占桌面。


## 8. R3独立军械规则接入前对照（2026-09-29）

本轮重新实际查看R04鱼雷标注近景与背视图：标注位于中前部肩台前壁，并非舰艏两根前伸杆。不能从两个面板直接推断两管左右布局。另查看Christian模型公开缩略图（3d251c8c67c84a268140ef70d32dea82），仍不足以确定后装轨炮的季数与安装面。搜索返回验证/拒绝或无关结果，未绕过验证，未当来源；原始查询响应保存在artifacts/rocinante/rail-torpedo-research。R04与新缩略图只作研究，不进入运行素材。

因此先实现不依赖未证实挂点的R3规则，不再猜测轨炮/鱼雷坐标。来源→预期→差异→验证：

- 任务书§5A是已记录的Web数值候选，不是原作口径/性能；ShipWeaponControlSystem已有视觉recoil，但没有改变舰速的物理反冲。新增明确opt-in的fireRecoilSpeed（每次获准发射后的反向速度增量），默认0；拒绝发射、光束不产生反冲。先生成弹体继承的发射前速度，再给发射舰速度增量，不移动位置或旋转旧弹。
- 原有maxAmmo/ammoRegenPerSec、launchSpeed/flightTime/armingTime/missileLifecycleSpec已是宿主真实规则。分别配置60发PDC弹匣、8/5枚不再生鱼雷；0.2s武装、有限动力、熄火惯性＋淡出。低初速不称为尚未实现的延迟点火冷发射。
- 原有terrainPenetrationCost/spendTerrainPenetration支持小障碍有损穿越，护盾/完整舰体没有免费通行；按本舰700动能配置半径10、最低成本150。无需重写碰撞体系。
- 采用明确作者规则、无舰船注册的生产引擎场景，在主线程和真实专用Worker分别执行：资源拒绝无副作用、反冲方向与旧弹独立、弹药/再装填/周期、飞行到淡出清理、拦截生命值/小障碍边界。未加载新炮体时不渲染占位武器、不冒充整舰试玩。

## 9. 完整包接入前对照（2026-09-29）

本轮只补剩余军械/整舰/反馈/配装。已认可六门PDC、舰体和尺度保留。
- 原版本机0.98a-RC8：`data/weapons/railgun.wpn`与`proj/railgun_shot.proj`明确轨炮短弹道、railgun_fire音效；`vulcan.wpn`明确枪焰粒子与vulcan_cannon_fire；`harpoon.wpn`/`harpoon_mrm.proj`分离发射烟、导弹发动机、纯视觉爆炸与真实杀伤。
- 宿主`ShipEngineRenderer`使用原版engineglow32/engineflame32动态纹理。主推进复用，不制造新光圈。原版普通发动机有0.4怠速；新增显式辅助RCS是Web扩展，无怠速，只由权威运动实际变化点亮，不提供额外推力/驱动生命。
- 没有获得后期实拍轨炮的可用多角度安装证据。单轴炮固定腹侧、肩部两鱼雷口是明确标注的Web改装坐标，**不是已证实原作精确复刻**；不把两根艏杆解释为轨炮。
- 新AI军械材质以自有舰体为参考；原图948×1659 RGBA（与请求1024×1024不同）。四个正式部件：轴炮、单管发射座、两种可分辨弹体；裁掉发射座右侧错误白色痕迹，保留母版和像素/世界标定。
- 反冲补偿经成功出射回调取得实际反冲向量，仅补70%，不读视觉后坐值；弹匣扩容走宿主派生spec，不改变共享规格。采用原版舰装列表交互与宿主图标，不新造UI。
- 验证计划：同档/内置约束、两种60OP配装保存读回、真正命中/拦截/失效、技能互斥、运动喷流状态、无头设计页和真实Worker。原版实机与多人恢复不在已验范围。
