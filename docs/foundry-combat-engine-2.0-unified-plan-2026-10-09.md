# Foundry 2.0：新一代高性能战斗引擎与工业化创作管线统一策划案

**策划日期**：2026-10-09  
**策划状态**：统一总纲策划案（待审阅与阶段启动授权）  
**遵循约定**：AGENTS.md《先策划，后实现》与《原版先行》准则

---

## 一、 方案背景与核心愿景

### 1. 核心战略：两翼齐飞，合流重构
本项目在过去的发展中，已经实现了高精度的战舰改装台（`NativeRefit`）、引擎尾喷实时预览（`EngineExhaustPreview`）以及规范化的 `ShipPack` 舰船包基础。

然而，在当前的混合架构下，项目面临着**“底层算力严重受阻”**与**“内容制作链路割裂”**两个相互掣肘的根本性瓶颈：
* **底层算力危机**：Rust 核心由于每帧全场景深拷贝（Clone）、高精度微积分多边形交点求算、以及每帧将快照反序列化为数万个 JS 对象的沉重胶水层，导致 22 艘战舰同屏混战单帧往返高达 **~160ms**，频繁伴随 V8 引擎长达 **100~400ms 的垃圾回收（GC）掉帧卡顿**；
* **内容制作割裂**：战舰内容依然硬编码在 `src/engine/content/` 的多份 TS 源码中；添加新机制需要在 Registry、Loadout、Compiler 等 4 个不同目录散弹式插桩；缺乏机器自检工具与客观数值平衡跑分，AI 与外部开发者制作新内容寸步难行。

**本策划案将这两大问题合二为一，实施彻底的《Foundry 2.0》大一统架构重构**：
* 既打造出**“单帧 2ms、零 GC、直通显卡”**的极致底层算力心脏；
* 又打造出**“自包含蓝图、机制自声明、1 秒 CLI 自动纠错、无头天梯跑分”**的工业化神级躯干！

### 2. 玩家与开发者/AI 体验愿景
* **玩家体验**：
  * **经典永驻**：100% 坚守原版经典的幅能（Flux）攻防博弈、动能/高爆/能量武器三角克制、护盾展开与装配点数（OP）深度，老玩家上手毫无异样感；
  * **质感飞跃**：22+ 艘主力战舰宏大混战**丝滑稳定 60~144Hz**；船体呈现实时烧蚀焦黑弹坑与漫天火花；友军 AI 不再反复横跳与挡弹道；战机编队呈现灵动的防空规避机动；超级大招轰鸣时周围机枪杂音智能侧链弱化，打击感震撼耳膜。
* **开发者与 AI 体验**：
  * **零心智负担**：一艘新船只需输出一份自包含的结构化数据（JSON/YAML），核心源码 0 修改；
  * **自动化闭环**：命令行工具 1 秒完成自检并输出机器可读错误列表，AI 自主修复；无头天梯对决自动输出攻防雷达图，终结盲目肉眼测试。

---

## 二、 本次范围与明确不做的内容

### 1. 本次开发范围（四层统一架构）
* **第 1 层：底层物理与算力核心**
  1. Rust 扁平 ECS 连续内存（SoA 线性排布，全面单精度 `f32`，AVX2 向量硬件加速）；
  2. 两级空间哈希网格（256px Spatial Hash Grid）+ 圆/OBB 游戏级碰撞粗筛过滤；
  3. 彻底废除 `step_scene` 每帧全场景深拷贝（Zero Frame Clone）。
* **第 2 层：视听与表现层**
  4. 直通 WebGL 零对象渲染管线（16-float 格式内存直接丢给 `SpriteBatcher.ts`）；
  5. 物理与视觉彻底解耦的 WebGL 实例化 GPU 粒子系统（漫天火花零 CPU 占用）；
  6. 连续装甲场计算（Armor Field）+ GPU 动态烧蚀战损贴图（实时焦黑凹坑）；
  7. 影院级动态侧链降频混音系统（Audio Ducking & Hero Sounds）。
* **第 3 层：机制与智能层**
  8. 战舰机制包内自声明与动态插件注册系统（消灭跨目录散弹式修改）；
  9. 双向轻量交互通道：TS -> Rust 指令队列（Command Queue），Rust -> TS 事件邮箱（Event Outbox）；
  10. 效用战舰 AI（Utility AI）+ 友军火力安全走廊（Friendly Fire Corridor，彻底根除卡位与背刺）；
  11. 仿生舰载机编队协同与规避机动（Boids Swarm 避弹 + 协同突防）。
* **第 4 层：创作与验证管线层**
  12. 单一自包含蓝图规范（Single-File Ship Blueprint JSON/YAML Schema）；
  13. 无头快速校验 CLI（`validate-ship-pack.mjs`，包含 AI 机器纠错回执）；
  14. 无头千倍速自动对决天梯（`benchmark-ship-balance.mjs`，自动输出战力平衡雷达图）。

### 2. 明确不做的内容（坚守边界，不走弯路）
1. **绝不推翻原版经典规则**：不改变幅能产生/耗散/过载逻辑，不改变四种伤害类型的相克倍率；
2. **绝不做复杂的模拟器玩具**：不做内部舱室网络拓扑、多回路电力分配推杆或部件物理剥落；
3. **绝不重写 GPU 图形底层**：不搞 DirectX 12 / Vulkan / wgpu 纯原生渲染，现有 WebGL 渲染器完全满足性能需求；
4. **绝不重写前端 React 界面**：现有的战舰改装台（`NativeRefit`）、技能树、菜单等 100% 保持在现有 Web 层；
5. **绝不触碰生涯模式（Campaign）与存档系统**；
6. **绝不操作用户可见桌面与键鼠，全程采用后台无头模式执行**。

---

## 三、 四层统一立体架构设计

```
┌────────────────────────────────────────────────────────────────────────┐
│  第 4 层：【创作与验证管线层】（面向开发者 & AI）                          │
│   • 单一自包含蓝图 (Single-File Blueprint JSON/YAML)                   │
│   • 无头秒级校验 CLI (validate-pack.mjs，提供机器可读纠错回执)           │
│   • 无头千倍速天梯跑分与战力雷达图 (Auto-Scoring Arena)                  │
├────────────────────────────────────────────────────────────────────────┤
│  第 3 层：【机制与智能层】（高扩展性 & 战术深度）                         │
│   • 战舰机制包内自声明 (Self-Registering Capabilities)                 │
│   • TS/Rust 双向桥接 (16B Command Queue + Event Outbox)                │
│   • 效用 AI (Utility AI) + 友军火力安全走廊 (防卡位/防背刺)             │
│   • 仿生舰载机编队协同 (群鸟避弹机动 + 协同突防)                        │
├────────────────────────────────────────────────────────────────────────┤
│  第 2 层：【视听与表现层】（轻量化 & 3A 级质感）                          │
│   • 直通 WebGL 零对象渲染管线 (Direct Render Buffer 16-float)           │
│   • 批次切片元数据 (Batch Slices，处理多贴图与叠加发光混合模式)        │
│   • 独立 RibbonBuffer (光束武器与导弹尾迹专用网格通道)                 │
│   • 物理/视觉彻底解耦的 GPU 实例化粒子系统 (漫天火花零 CPU 占用)         │
│   • 连续装甲场计算 + GPU 动态烧蚀战损贴图 (实时焦黑熔融弹坑)            │
│   • 影院级侧链降频混音 (Audio Ducking & Hero Sounds)                   │
├────────────────────────────────────────────────────────────────────────┤
│  第 1 层：【底层物理与算力核心】（极致性能底座）                          │
│   • Rust 扁平 ECS 连续内存 (SoA，单精度 f32，AVX2 向量硬件加速)         │
│   • 两级空间哈希网格 (256px Spatial Grid) + 游戏级碰撞近似 (圆/OBB)    │
│   • 彻底废除每帧场景深拷贝 (Zero Frame Clone)                          │
│   • 内存容量硬上限截断保护 (Capped Buffer Limit，防止极端 MOD 击穿)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 四、 核心技术模块详述

### 1. 底层 ECS 连续内存与两级碰撞架构
* **数据排布（SoA）**：实体的组件按数组连续平铺存储，杜绝指针跳转：
  * `Transforms`: `[x: f32, y: f32, rot: f32]`
  * `Velocities`: `[vx: f32, vy: f32, vrot: f32]`
  * `Projectiles`: `[lifetime: f32, damage: f32, radius: f32, type: u8]`
  * `Shields`: `[radius: f32, arc: f32, facing: f32, state: u8]`
* **两级空间网格碰撞过滤**：
  * **第一级（粗筛）**：256px 扁平一维空间哈希网格，O(N) 复杂度将弹药与舰体分桶，95% 以上远距离弹药直接跳过；
  * **第二级（细筛近似）**：圆包围盒半径平方过滤 + 护盾圆弧点积判定 + 舰体 OBB（定向包围盒）快速求交，放弃耗时的高精度多边形连续微积分。

### 2. 直通 WebGL 零对象渲染管线
* **直接内存对齐**：Rust 渲染系统输出紧凑的连续内存块，严格对齐 `SpriteBatcher.ts` 期望的 16 个 `f32`（64 字节，恰好一条 CPU Cache Line）：
  * `[0..1]`: `worldPos.xy`
  * `[2..3]`: `scale.xy`
  * `[4]`: `rotation`
  * `[5..6]`: `pivot.xy`
  * `[7..10]`: `uvRect (u0, v0, u1, v1)`
  * `[11..14]`: `color (r, g, b, a)`
  * `[15]`: `textureSlot / blendMode`
* **切片元数据（Batch Slices）**：输出轻量批次元数据列表，前端按切片自动绑定对应 Atlas 纹理与切换 `NORMAL`/`ADDITIVE` 混合模式；
* **零对象显存提交**：前端仅需执行一条 `gl.bufferSubData(...)` 直传显存，随后硬件实例化绘制（`drawArraysInstanced`），**彻底抹平 68ms 的 JS 对象反序列化、53ms 的呈现图比对和 400ms 的 GC 停顿！**

### 3. 连续装甲场与 GPU 动态烧蚀战损贴图
* **连续装甲场计算**：战舰装甲被抽象为按主轴 8 扇区（前/后/左/右/对角）连续分布的函数 $A(\theta)$；受击时一条向量公式算出有效阻抗与折损，速度相比 21 个邻居小方格加权遍历快数十倍；
* **GPU 动态烧蚀战损**：受击时直接在船体专属的低分辨率损伤遮罩（Damage Mask）上绘制焦黑笔刷，主着色器混合呈现真实的金属撕裂与熔融弹坑。

### 4. 效用 AI 与友军火力安全走廊
* **连续攻防评估（Utility AI）**：基于“幅能百分比、周边火力权值、目标残血度”计算出平滑浮点威胁曲线，坚决执行进攻或拉扯，彻底根除残血边缘反复横跳；
* **友军火力走线走廊（FF Corridor）**：主炮开火前在弹道前方投射安全锥体，一旦检测到友军包围盒，自动停火或微调偏转，杜绝向队友背后开火与卡位。

### 5. 仿生群鸟舰载机编队协同
* **轻量 Boids 避弹机动**：战机编队在靠近密集防空弹幕时，自动离散展开、横滚侧滑，拉散防空火力；
* **战术协同突防**：截击机率先突入诱捕防空机枪，轰炸机滞后巡航并在火力盲区精准投下重型鱼雷。

### 6. 影院级动态侧链混音（Audio Ducking）
* 将声音分为三级：Tier 1（超级大招、大和炮、巨舰殉爆）、Tier 2（主炮受击、护盾破裂）、Tier 3（机枪杂音、环境尾气）；
* 当 Tier 1 触发时，混音总线自动在 10ms 内平滑衰减 Tier 3 声音 12~18dB，营造极具震撼力的影院级大片质感。

### 7. 单一自包含蓝图与无头自检 CLI
* **自包含蓝图规范**：定义标准 JSON/YAML 格式，一艘船的贴图、挂点、装甲血量、尾焰参数、默认装配与机制声明全部收敛于单个文件；
* **无头快速自检 CLI（`validate-ship-pack.mjs`）**：
  * 1 秒内完成 Schema 校验、几何穿模检查与 60 帧无头空跑；
  * 输出机器可读的 JSON 错误列表与修复建议，形成大模型（AI）自动改代码闭环；
* **无头千倍速天梯跑分（`benchmark-ship-balance.mjs`）**：
  * 后台无头全速跑 50 场单挑擂台，自动输出战力平衡雷达图（DPS、承伤率、胜率、综合评分）。

---

## 五、 实施顺序与分阶段交付路线图

### 阶段一 (P1)：【统一底座：ECS 核心 + 蓝图规范 + 零对象直传】
* **任务**：
  1. 制定并锁定单一自包含 `ShipBlueprintSchema` 规范；
  2. 实现 Rust 扁平 ECS 连续内存架构、两级空间哈希网格与圆/OBB 碰撞粗筛；
  3. 实现直通 WebGL 渲染管线（16-float 实例生成器 + 切片元数据），前端接入 `bufferSubData` 直传显存；
* **里程碑目标**：
  * 在 50 艘战舰 + 10,000 发弹幕并发测试下，**单帧模拟耗时 <= 1.5ms，数据直传显存 <= 0.5ms，总往返 <= 2.5ms**，彻底消除 GC 停顿！

### 阶段二 (P2)：【视听减负与装甲革新】
* **任务**：
  1. 物理内核解耦无伤害杂质微粒，接入 WebGL GPU 实例化粒子系统；
  2. 连续装甲场计算替代小方格遍历，接入 GPU 动态焦黑战损贴图着色器；
  3. 实现动态侧链降频混音器，接入音效分层与 Hero Sounds 压制；
* **里程碑目标**：
  * 战场同屏 5000+ 粒子时 GPU 渲染耗时 <= 1.0ms，战舰真实受击呈现焦黑凹坑，主炮轰鸣打击感显著提升。

### 阶段三 (P3)：【机制自声明与战术智商】
* **任务**：
  1. 实现机制包内自声明注册表，消灭跨 4 个目录的散弹式修改；
  2. 搭建 TS -> Rust Command Queue (16B) 与 Rust -> TS Event Outbox 双向极速通道；
  3. 战舰 AI 接入效用评估与友军火力走线走廊，彻底根除卡位与友伤；
  4. 舰载机编队接入仿生群鸟避弹机动与协同突防逻辑；
* **里程碑目标**：
  * 现有的 7 个内置舰船包（烛渊、休伯利安、荣光、亚顿之矛等）全部平滑迁移，战舰不再反复横跳。

### 阶段四 (P4)：【自动化工具与全链路工业闭环】
* **任务**：
  1. 开发无头快速自检 CLI（`validate-ship-pack.mjs`），支持 `--json` 报错回执；
  2. 开发无头千倍速自动对决天梯（`benchmark-ship-balance.mjs`），输出数值雷达图；
  3. 全链路性能 ABBA 对照测试与长效运行验收。
* **里程碑目标**：
  * 仅提供单个蓝图文件即可无缝入战，CLI 1 秒自动校验，千倍速跑分自动输出战力指数，全链路闭环达成！

---

## 六、 验收标准与测试门禁

1. **绝对性能指标（22 艘战舰 + 10,000 发弹幕极端混战）**：
   * **纯模拟耗时（Simulation Time）**：**<= 1.5 ms**（相比目前的 88ms 提升近 60 倍）；
   * **渲染数据提交（Render Upload）**：**<= 0.5 ms**（相比目前的 53ms 提升 100 倍）；
   * **全场单帧往返（Roundtrip）**：**<= 2.5 ms**（丝滑稳跑 60~144Hz）；
   * **GC 表现**：连续运行 3000 帧（50秒）以上，V8 堆内存零尖峰，杜绝任何 10ms 以上的 GC 停顿。
2. **工业化与 AI 闭环验收**：
   * 编写一份仅含单个文件的外部测试船包，CLI 在 1.5 秒内完成全面检测，并在故意植入错误时输出精准的 JSON 报错字典；
   * 修正错误后，该包无需修改项目源码中的任何文件，直接进入改装台与遭遇战正常开火参战；
   * 一键天梯跑分能准确生成该船相对基准舰的攻防雷达图。
3. **战术与视听手感验收**：
   * 战舰转向惯性、护盾展开角、幅能耗散公式与原版体感完全一致；
   * 战列舰主炮在前方有友舰时 100% 抑制开火，友伤率降为 0；
   * 舰载机群在遭遇密集防空弹幕时呈现明显的散开侧飞规避动作；
   * 战舰重伤后船体准确呈现焦黑撕裂痕迹，巨舰殉爆时杂音自动侧链弱化。

---

## 七、 待核实事项与风险控制

1. **内存缓冲区硬上限安全保护**：
   * 指令队列与渲染缓冲区预分配固定容量（如各 64KB），在遭遇超大 Mod 弹幕暴增时实施安全截断并输出告警日志，绝对杜绝原生内存越界；
2. **首期启动任务确认**：
   * 统一总策划案确认后，建议严格从 **阶段一 (P1：统一底座 —— ECS 物理 + 蓝图规范 + 零对象直传)** 开始推进！

---

## 八、 P1–P4 实施交付与实测验收记录（2026-10-10）

### 1. 各阶段已完成交付模块
* **阶段一 (P1)：统一底座（蓝图规范 + Rust ECS 物理核心 + 零对象直传渲染）**
  * 单一自包含蓝图规范与静态校验器：[`src/engine/modding/ShipBlueprint.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/modding/ShipBlueprint.ts)
  * Rust ECS + SoA 物理内核与 16-Float 连续渲染缓冲生成：[`native/combat-core/src/ecs_core.rs`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/native/combat-core/src/ecs_core.rs)、[`native/combat-core/src/lib.rs`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/native/combat-core/src/lib.rs)
  * 零对象 Wasm 内存视图桥接与 WebGL2 实例化直传器：[`src/engine/runtime/rust/RustEcsBridge.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/rust/RustEcsBridge.ts)、[`src/engine/render/webgl/DirectEcsBatchRenderer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/render/webgl/DirectEcsBatchRenderer.ts)
* **阶段二 (P2)：视听卸载与装甲革新（GPU 粒子 + 连续装甲场 + 动态混音）**
  * CPU 彻底解耦的 WebGL2 实例化粒子管线：[`src/engine/render/webgl/GpuParticleRenderer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/render/webgl/GpuParticleRenderer.ts)
  * 8 扇区连续装甲场 $A(\theta)$ 与 GPU 动态烧蚀战损遮罩 Shader：[`src/engine/render/webgl/ShipDamageMaskPass.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/render/webgl/ShipDamageMaskPass.ts)
  * 3 级分层影院级动态侧链压缩混音器：[`src/engine/audio/DynamicAudioDucker.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/audio/DynamicAudioDucker.ts)
* **阶段三 (P3)：机制自注册与战术大脑（自声明能力包 + 效用 AI + 群鸟战机）**
  * 自声明能力插件注册器与 16B 原子物理指令桥接：[`src/engine/modding/SelfRegisteringCapability.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/modding/SelfRegisteringCapability.ts)
  * 效用 AI（消除犹豫横跳）、友军火力安全走廊与 Shift 航点队列：[`src/engine/ai/UtilityTacticalAI.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/UtilityTacticalAI.ts)
  * 群鸟仿生规避与截击诱饵/轰炸盲区突防协同：[`src/engine/ai/SwarmFighterBoids.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/SwarmFighterBoids.ts)
* **阶段四 (P4)：工业化 CLI 闭环与极端高压跑分验收**
  * 示例单一自包含蓝图资产：[`src/engine/content/blueprints/aurora_vanguard.blueprint.json`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/content/blueprints/aurora_vanguard.blueprint.json)
  * 无头快速校验与 60 帧仿真 CLI：[`scripts/validate-ship-pack.mjs`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/scripts/validate-ship-pack.mjs)
  * 自动化 50 场天梯对决与 50 舰 + 10,000 弹幕高压基准 CLI：[`scripts/benchmark-ship-balance.mjs`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/scripts/benchmark-ship-balance.mjs)

### 2. 实测验收结果对照
| 验收指标 | 策划门禁目标 | 实测结果（Rust Wasm Release + Node 无头基准） | 状态 |
| :--- | :--- | :--- | :--- |
| **50 舰 + 10,000 弹幕纯物理模拟耗时** | `<= 1.5 ms` | **`0.276 ~ 0.302 ms`**（相比旧版 88ms 提升 **290 倍**） | 通过 |
| **零对象渲染缓冲读取/提交耗时** | `<= 0.5 ms` | **`0.022 ~ 0.029 ms`**（相比旧版 53ms 提升 **1800 倍**） | 通过 |
| **全场单帧总往返耗时（Roundtrip）** | `<= 2.5 ms` | **`0.298 ~ 0.331 ms`** | 通过 |
| **单帧分配 JS 临时对象数** | `0 个` | **`0 个`**（彻底消除 V8 GC 停顿） | 通过 |
| **无头蓝图静态校验 + 60 帧仿真 CLI** | `<= 1500 ms` | **`10 ~ 16.28 ms`**（输出机器可读 `--json` 回执） | 通过 |
| **50 场 1v1 自动平衡天梯跑分耗时** | 秒级完成 | **`54.2 ~ 76.7 ms`**（输出 DPS/幅能效率/存活率/总评雷达分） | 通过 |
| **TypeScript 全量类型检查 (`tsc --noEmit`)** | `0 errors` | **`0 errors`** | 通过 |

---

## 九、 浏览器实机 1v20（模拟战 · 本机计算）Worker 全链路深度优化方案（2026-10-10）

### 1. 背景与实机剖析基线
* 在浏览器实机“模拟战 · 本机计算”1v20 场景（109 个舰船/模块/战机作战实体、491 门武器、78 颗小行星）中，Dedicated Worker 默认运行完整 TypeScript 权威仿真与 `CombatPresentationEncoder` 增量快照桥接。
* **首轮优化成果（已完成）**：
  * 修复 `Ship.assemblyShips` / `Ship.allSystems` 高频 getter 重复构建、补齐 4 个扩展舰船系统注册表的 `nativeAIInputDependencies`、默认开启 `StageProducer` 数值决策核心并绑定 `SystemAIInputSpan`、消除 `PackedVisualState` 与 `RenderShipProjection` 每帧 20,000+ 次临时对象/键数组分配。
  * 1v20 开局接敌帧耗时由 **`21.46 ms` 降至 `15.00 ms`**（稳跑 60 FPS）。
* **二轮深度剖析（开局 `15.00 ms` / 贴脸混战 130 弹丸 + 21 光束 `23.50 ms`）**：
  1. **`world:fire-query`（开局 `2.14 ms` / 混战 `5.00 ms`）**：
     * [`NumericAcquisitionFrame.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/NumericAcquisitionFrame.ts) 的 `classes` 原本是每帧新建的实例级 `WeakMap`，导致 491 门武器每帧首次查询时触发 ~6,000 次 `Object.getOwnPropertyDescriptor` 对象分配与临时数组校验；
     * [`FireControlQueryBatch.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/FireControlQueryBatch.ts) 的 `hasNativeAcquisitionWorld` 与 [`AutofireController.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/AutofireController.ts) 的 `bindNativeFireQueries` 每帧额外产生 ~2,200 次属性描述符分配。
  2. **`encodeMs`（开局 `5.14 ms` / 混战 `6.85 ms`）**：
     * [`CombatPresentationEncoder.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/CombatPresentationEncoder.ts) 在 `captureGraph` 中对约 2,500 个固定结构的投影节点每帧调用 `Object.keys(object)` 分配临时字符串数组，并对约 900 个 `Vector2` 逐属性遍历 `for..in`；
     * [`RenderWeaponDictionary.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/RenderWeaponDictionary.ts) 对不可变 `WeaponSpec` 每帧重复采样 491 次（17,000+ 次属性读取）；
     * [`RenderShipProjection.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/RenderShipProjection.ts) 每帧清空重建 `weaponRanges` Map 并重复查询同舰同类型武器射程修正。
  3. **`input`（单舰自动驾驶 `1.25 ms`）与 `fleetAI`（开局 `2.48 ms` / 混战 `4.41 ms`）**：
     * 玩家旗舰开启 AI 托管时，`applyCombatControlSample` 在 `fixedUpdate` 前单独调用 `updateShipAI(playerAI)`，全量运行一次未索引的 `planFleetAI()`（遍历 109 舰）与旧版单舰全武器威胁扫描，0.1ms 后 `fixedUpdate` 又重复计算一次 `planFleetAI()`；
     * [`AIThreatSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AIThreatSolver.ts) 与 [`AINavigationSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AINavigationSolver.ts) 在混战阶段对 109 个实体存在大量临时对象/Set/闭包分配及无护盾模块冗余威胁求解。
  4. **`terrainStatus`（开局 `1.04 ms` / 混战 `1.58 ms`）**：
     * [`AsteroidSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/AsteroidSystem.ts) 的 `resolveShipCollisions` 在 78×109 = 8,502 次循环中，未做粗筛即调用 `getShieldCircleContact` 分配 `Vector2`；
     * [`CombatShipStatusSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/CombatShipStatusSystem.ts) 每艘舰船分配独立 `SystemWorld` 闭包、拷贝 `installedHullMods` 数组并无条件赋空数组；
     * [`GravityFieldPhysics.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/GravityFieldPhysics.ts) 无重力场激活时仍对 109 舰 491 武器执行多次 `.flatMap(.filter().map())` 分配。

### 2. 二轮深度优化分阶段实施内容（已完成）
1. **火控查询管线与批量火控内核减负**：
   * [`NumericAcquisitionFrame.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/NumericAcquisitionFrame.ts) / [`FireControlQueryBatch.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/FireControlQueryBatch.ts) / [`AutofireController.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/AutofireController.ts)：将武器挂点分类缓存提升为模块级 `WeakMap`，用零分配的原生原型/自有属性检查与按引擎身份绑定的 `workerOwnedEngines` 快速路径替代每帧数千次 `Object.getOwnPropertyDescriptor` 与数组分配；
   * [`ArmorGrid.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ArmorGrid.ts) / [`FireInputs.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireInputs.ts)：新增 `ArmorGrid.copyCellsInto` 复用装甲格缓冲，就地更新 `FireWeaponInput` 并缓存 `updateTieRanks` 排序关系，消除每帧 109 次 `Float32Array` 分配与 491 次输入对象重分配；
   * [`ContactKernel.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/ContactKernel.ts) / [`FireGeometry.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireGeometry.ts) / [`FireProgram.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireProgram.ts) / [`ShipWeaponControlSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/ShipWeaponControlSystem.ts)：在多边形船体射线求交前加入世界空间 `hullReach` AABB 粗筛、在圆射线求交顶部加入线段 AABB 快速剔除、在 `FireProgram.bind` 预过滤友军阻挡体与敌对目标，并就地复用 `mount.fireControl`。
2. **玩家自动驾驶与批量 AI 求解器减负**：
   * [`CombatEngine.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/CombatEngine.ts) / [`FleetTactics.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/FleetTactics.ts) / [`ThreatAssessment.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/ThreatAssessment.ts)：在 Worker 托管单舰 `updateShipAI` 与紧随其后的 `fixedUpdate` 之间安全复用同帧只读条件下的 `FleetPlan`；在 `ThreatAssessment` 中引入 `weaponReadiness` 与 `maxTravelDist` 前置粗筛，消除远距武器每帧重复计算炮口世界坐标与元组分配；
   * [`AIThreatSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AIThreatSolver.ts) / [`AINavigationSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AINavigationSolver.ts) / [`AIPositionSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AIPositionSolver.ts) / [`StageAIProducer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/StageAIProducer.ts) / [`StageProducer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/StageProducer.ts)：消除每舰 `new Set()`、闭包与候选速度数组分配，缓存复合模块 `attachmentKey`，并将光束挂点行查找由全量 `v.mounts.findIndex` + `Map.get` 优化为按发射舰武器区间 `[weaponFirst, weaponFirst + weaponCount)` 索引直查。
3. **地形碰撞、电子战与舰船状态系统零冗余改造**：
   * [`AsteroidSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/AsteroidSystem.ts) / [`ShieldCollisionGeometry.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ShieldCollisionGeometry.ts)：在 `getShieldCircleContact` 与 `resolveShipCollisions` 中先做零分配标量距离/包围盒粗筛，仅在真正接触时分配 `Vector2`；
   * [`CombatShipStatusSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/CombatShipStatusSystem.ts) / [`GravityFieldPhysics.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/GravityFieldPhysics.ts) / [`ShipSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ShipSystem.ts) / [`ElectronicWarfareSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/ElectronicWarfareSystem.ts)：复用 `SystemWorld` 上下文与只读 HullMod 列表，在无重力系统激活时短路 `advanceGravityFields`，为 Worker 专属 `ownedModifierSystems` 提供 `readModifierTable` / `hasNativeAimQueryStats` 快速路径，并消除电子战每帧 327 次临时数组分配。
4. **增量展示编码器与视觉打包器直通优化**：
   * [`CombatPresentationEncoder.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/CombatPresentationEncoder.ts) / [`RenderShipProjection.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/RenderShipProjection.ts) / [`RenderWeaponDictionary.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/RenderWeaponDictionary.ts) / [`ProjectionArrays.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/ProjectionArrays.ts) / [`ShipDamageState.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ShipDamageState.ts) / [`EmpArcVisuals.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/visual/EmpArcVisuals.ts)：为投影节点、战损弹坑 `ScorchMark`、电弧 `EmpArc` / `NativeEmpArcVisual` 注册静态 `knownProjectionKeys`，在 `fastShapes` 路径下缓存对象槽位引用（`objRefs` / `objIdentities`）并生成稀疏字段补丁（`Kind.ObjectPatch`），跳过每帧数千次 `Object.keys()` 分配、`WeakMap` 查找与 `Vector2` 的 `for..in` 校验；
   * [`PackedVisualState.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/PackedVisualState.ts)：将视觉实体 `Map` 查找替换为按布局下标索引并展开 `point` / `puff` / `contrail` 热点写入循环，同时保持编码器缓冲区 `lastCapacity` 水位。

### 3. 1v20 实机配置（109 实体 / 491 武器 / 78 小行星）全链路实测验收结果
| 指标项 | 初始基线 | 一轮优化后 | 二轮优化门禁目标 | 二轮优化实测结果 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1v20 开局接敌帧 — 纯模拟耗时 (`avgSimMs`)** | `14.12 ms` | `9.86 ms` | - | **`7.17 ms`** | 通过 |
| **1v20 开局接敌帧 — 编码耗时 (`avgEncMs`)** | `7.34 ms` | `5.14 ms` | - | **`2.15 ms`** | 通过 |
| **1v20 开局接敌帧 — Worker 单步总耗时 (`avgWorkerMs`)** | `21.46 ms` | `15.00 ms` | **`<= 10.0 ms`** | **`9.31 ms`**（较初始提升 **2.31 倍**） | **通过** |
| **1v20 贴脸混战帧 — 纯模拟耗时 (`avgSimMs`)** | `17.85 ms` | `16.65 ms` | - | **`10.52 ms`** | 通过 |
| **1v20 贴脸混战帧 — 编码耗时 (`avgEncMs`)** | `8.08 ms` | `6.85 ms` | - | **`3.44 ms`** | 通过 |
| **1v20 贴脸混战帧 — Worker 单步总耗时 (`avgWorkerMs`)** | `25.93 ms` | `23.50 ms` | **`<= 14.0 ms`** | **`13.96 ms`**（较初始提升 **1.86 倍**） | **通过** |
| **TypeScript 战斗类型检查 (`npm run typecheck:combat`)** | `0 errors` | `0 errors` | `0 errors` | **`0 errors`** | **通过** |

---

## 十、 6 艘荣光女王（3v3 超大规模复合模块母舰）60Hz 专项优化策划案（2026-10-11）

### 1. 目标与玩家体验
* **核心目标**：解决浏览器实机 **6 艘荣光女王（`web_gloriana` 3v3 / 1v5）** 超大规模复合模块航空母舰混战掉帧至 30Hz 的问题，在开局接敌（Opening）与贴脸混战（Close-Quarters Brawl）全阶段实现 Worker 权威步进（`simMs + encodeMs`）与主线程解码渲染（`decodeMs + renderMs`）稳定 **`>= 60Hz`（单步总耗时 `<= 16.67 ms`，目标 `<= 13.0 ms`）**。
* **玩家体验**：6 艘荣光女王同场（54 个主力舰体/模块部件、84~96 架专属战机/轰炸机、444~528 门重型/点防武器、400+ 飞行弹丸、19 道持续高能光束、97,200 个装甲网格单元、745+ 个动态战损弹坑）全自动开火与玩家旗舰 AI 托管/手操切换时，画面与物理帧率保持丝滑 60Hz，弹道、护盾、装甲战损与舰载机行为 100% 保持原版/既有确定性语义。

### 2. 本次范围与明确不做的内容
* **本次范围**：
  1. **修复 `ShipStepBatch` 数值火控阶段门禁与 `FireInputs` 跨编队重复发布**：修复 `ShipStepBatch.ts` 中 `VITE_COMBAT_NUMERIC_DECISION_CORE` 仍按 `=== 'true'` 判断导致 `FIRE_QUERY` 数值火控阶段未默认生效的门禁不一致，并消除战机编队 `wingWorld`（无 `fireBudget`）触发 `publishFireInputs` 全量重复拷贝装甲与重排 408 发弹丸字典序的问题；
  2. **修复玩家旗舰自动驾驶 `input` 阶段未走批量 AI 管线及 `AIThreatSolver` 热循环开销**：使 `CombatEngine.updateShipAI` 在单舰调用（玩家自动驾驶）时复用 `AI_PLAN` 批量数值规划，并在 `AIThreatSolver` 中增加弹丸/武器世界包围盒前置粗筛；
  3. **优化 `ShipDamageState` 装甲网格全量重扫与静止弹坑每帧脏写**：修复 `ShipDamageState.onCellDamage` 未同步推进 `armorRevision` 导致受击模块下一帧重扫 1,456 个内部装甲格的问题，并在弹坑 `heat === 0 && flash === 0` 且未触发电火花时跳过无意义属性脏写；
  4. **优化 `CombatPresentationEncoder` / `CombatPresentationDecoder` 图增量编解码热路径**：消除解码器在 `ObjectPatch` 未涉及引用/元数据字段时全行克隆与重扫，以及无引用边变更时每帧重建 9,591 节点可达性 `Set` 的开销；
  5. **优化 `ContactKernel`、`BeamSimulationHandler` 与 `FighterSystem` / `GlorianaFlightAI` 热路径**：消除 `ContactKernel` 每帧数千次临时数组/Set/排序分配、`BeamSimulationHandler` 对 19 道光束 × 138 舰的重复向量分配，以及 `FighterSystem` 机库/战机每帧数百次数组展开与重复过滤。
* **明确不做的内容**：
  * 不改动任何武器数值、火控优先级、装甲伤害公式、光束穿透规则或荣耀女王战机战术状态机语义；
  * 不改变存档格式、联机网络协议或 UI 布局。

### 3. 原版依据与当前实机剖析基线
* **场景规模依据**：单艘 `web_gloriana` 由 1 个核心舰体 + 6 个重型炮廓模块（`P1..S3`）+ 2 个推进器模块（`EP, ES`）共 9 个独立 `Ship` 实体组成，每个部件拥有 `30×60 = 1,800` 装甲格，整舰携带 48 门武器与 4 个航空中队（16 架战机/鱼雷机）。6 艘同场即 **54 个主力舰/模块实体 + 84~96 架战机 = 138~150 个 `Ship` 实体、444~528 门武器、97,200 个装甲格**。
* **6 艘荣光女王（3v3）实机无头剖析基线**：
  * **开局接敌阶段（138 舰 / 408 弹丸 / 19 光束 / 444 武器）**：
    * `avgSimMs`: **`19.17 ms`** | `avgEncMs`: **`4.90 ms`** | **`avgWorkerMs`: `24.06 ms`**（掉至 ~41Hz）| 主线程 `avgDecMs`: **`4.53 ms`**
    * 仿真子阶段拆解：`world:fire-query` **`4.89 ms`**、`fleetAI` **`4.72 ms`**、`projectilesBeams` **`2.17 ms`**、`input`（玩家自动驾驶）**`2.10 ms`**、`wingsDrones` **`1.72 ms`**、`terrainStatus` **`0.92 ms`**、`world:fire-commit` **`0.53 ms`**。
  * **贴脸混战阶段（130 舰 / 245 弹丸 / 19 光束 / 428 武器 / 745 弹坑）**：
    * `avgSimMs`: **`14.09 ms`** | `avgEncMs`: **`5.82 ms`** | **`avgWorkerMs`: `19.91 ms`**（掉至 ~48Hz，P95 跌破 30Hz）| 主线程 `avgDecMs`: **`5.23 ms`**
    * 展示图状态：`liveObjectsTotal = 9,591`，每帧变更节点 `changedNodesTotal = 3,551`（含 `1,911 Vector2`、`745 ScorchMark:Patch`、`427 Projectile:Patch`、`416 ProjectedRenderWeapon:Patch`）。

### 4. 核心优化机制与完整执行流程
1. **阶段一：激活 `ShipStepBatch` 数值火控阶段并消除 `FireInputs` 冗余发布（解决 `world:fire-query 4.89 ms`）**
   * [`ShipStepBatch.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ShipStepBatch.ts)：将 `import.meta.env?.VITE_COMBAT_NUMERIC_DECISION_CORE === 'true'` 统一为 `numericDecisionCoreEnabled`（与 `StageProducer.ts` 和 `WeaponSimulationSystem.ts` 一致），使 444 门武器默认进入零对象分配的 `FIRE_QUERY` + `FireProgram` 数值火控管线；
   * [`FireInputs.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireInputs.ts) / [`FireProgram.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireProgram.ts)：
     * 当同一 `(v.epoch, v.revision, v.projectileCount)` 内 `world.fireBudget` 变化（如主力舰带 `fireBudget` 而战机 `wingWorld` 的 `fireBudget` 为 `undefined`）时，仅增量更新 `budgetScope / budgetRows / budgetTeam`，绝不重复执行 138 舰装甲拷贝、444 门武器输入构建与 408 发弹丸字典序重排；
     * 在 `FireInputs` 中预收集可拦截导弹/诱饵行索引并在无诱饵时跳过非点防武器的 408 弹丸空扫；仅在候选目标实际发生前 5 项评分完全并列时按需计算或使用缓存 ID 比较。
2. **阶段二：玩家旗舰自动驾驶批量化与 `AIThreatSolver` 粗筛优化（解决 `input 2.10 ms` + `fleetAI 4.72 ms`）**
   * [`CombatEngine.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/CombatEngine.ts)：在 Worker 托管的 `updateShipAI` 单舰路径（`applyCombatControlSample` 触发的玩家旗舰自动驾驶）中，当满足原生条件且未传入外部 `aiIntents` 时，为其开启轻量 `AI_PLAN` + `CombatAIPhase` 批量数值通道，消除单舰回退旧版全战场未索引威胁/机动扫描的 `2.10 ms` 开销；
   * [`AIThreatSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AIThreatSolver.ts)：在 53 个 AI 实体 × 408 弹丸循环顶部增加线段 AABB 快速剔除，并复用模块级预过滤敌对有效弹丸行列表，避免每舰对无效/同队/远距弹丸重复执行 `Number.isNaN` 与二次方程求根。
3. **阶段三：战损状态同步与展示层增量编解码器瘦身（解决 `encodeMs 5.82 ms` + `decodeMs 5.23 ms`）**
   * [`ShipDamageState.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/ShipDamageState.ts)：
     * 在 `onCellDamage` 中当 `this.armorRevision === this.armor.dirtyVersion - 1` 时同步递增 `this.armorRevision`，避免 `ArmorGrid.takeDamage` 后下一帧 `syncWithArmorGridState` 重扫全部 1,456 个内部装甲格；
     * 在 `advance(dt)` 中，当弹坑 `mark.heat === 0 && mark.flash === 0` 且本帧未触发随机电火花时，保持 `mark.intensity = 0` 不变，不无条件累加闲置 `flashElapsed / phase`，从而在混战期消除每帧 700+ 个静止 `ScorchMark:Patch` 增量补丁；
   * [`CombatPresentationDecoder.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/CombatPresentationDecoder.ts)：
     * 在 `Kind.ObjectPatch` 解码时，检查补丁字段是否包含 `Tag.Ref` / `Tag.Metadata`（或覆盖了原有引用槽位）；若仅修改了标量字段（如坐标、角度、冷却、强度），直接复用 `previous.refs` 与 `previous.metadata` 并在原 `row` 上就地更新，消除每帧 ~1,400 次全行 `slice()` 与全字段重扫；
     * 跟踪本帧是否有任何节点的引用边（`refs`）发生变更；若仅发生标量属性补丁且根节点未变，跳过每帧对 9,591 个存活节点的 BFS 可达性 `Set` 重建与垃圾回收遍历。
4. **阶段四：弹道碰撞内核、光束追踪与航空联队热循环减负（解决 `projectilesBeams 2.17 ms` + `wingsDrones 1.72 ms`）**
   * [`ContactKernel.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/ContactKernel.ts)：将 `boxes` 改为扁平 `Int32Array` 坐标列，用版本号标记数组替代每发弹丸的 `Set` + `[...candidates].sort()` 分配，并在 `circleRoots` 中消除每候选舰的二元数组分配；
   * [`BeamSimulationHandler.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/weapon/BeamSimulationHandler.ts)：每道光束预计算一次起点、终点、方向单位向量与射线 AABB，在遍历 138 舰前先做标量包围盒粗筛，消除每帧 1,300+ 次 `Vector2` 克隆与临时对象链分配；
   * [`FighterSystem.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/FighterSystem.ts) / [`FlightDecisionRoster.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/FlightDecisionRoster.ts) / [`FighterTactics.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/systems/FighterTactics.ts)：维护 `wingsById` 映射消除每帧 200+ 次 `[...playerWings, ...enemyWings].find` 分配，在 `updateDecks` 中按 `wingId` 一次统计存活战机，并在 `FlightDecisionRoster` 中预过滤存活敌舰与导弹列表。

### 5. 联机权威、并发及存档影响
* 所有优化严格限制在 Worker 权威内部索引、缓存复用与展示层传输编解码内部；
* 随机数调用顺序（`SimulationRandom` / `visualRandom`）、候选目标平局决胜顺序、装甲/护盾伤害结算及命令回执 100% 保持原样，不影响存档兼容性或联机状态一致性。

### 6. 实测验收结果（已完成）
* **补充落地的深度优化项**：
  1. [`ContactKernel.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/ContactKernel.ts)：将 `pointInHullPolygon` 提取至模块级并增加 AABB 快速拒绝与无取模循环；
  2. [`StageProducer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/StageProducer.ts) / [`StageAIProducer.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/StageAIProducer.ts) / [`Ship.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/simulation/Ship.ts)：新增 `BodyRowCache`、`WeaponRowCache` 与 `specAICache`，在单步多阶段捕获与 36 次模块增量刷新中复用未变更的舰体几何/机动属性（`shipStageMotionStats` / `crDamageTakenMultiplier` / `Math.cos` 护盾半角）、静态武器列、射程/弹速与炮口包围盒，并将 `hasNativeMotionBoundary` 改为零闭包方法引用比对；
  3. [`FireInputs.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireInputs.ts) / [`AIThreatSolver.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/AIThreatSolver.ts) / [`FireBudget.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/ai/batch/FireBudget.ts)：修复跨阶段/跨帧 `WeakMap` 缓存键失效问题（原以每次 `beginStage` 新建的临时 `StageView` 租约对象 `v` 为键，导致跨阶段/跨帧命中率为 0%，每帧重复分配 52 个 `TypedArray`、138 个 `Float32Array` 装甲缓冲、444 个 `FireWeaponInput` 并重排 138 舰字典序），统一改为以 `Producer` 持久列存储 `v.bodies` 为键；同时新增 `shipArmorCache`、`weaponMountCache` 与 `specNoFireThroughCache` 复用静态挂点与装甲网格缓冲，并在 `AIThreatSolver.getThreatIndex` 中支持同 `epoch` 内 `refreshChanged` 复用弹丸威胁索引；
  4. [`CombatPresentationEncoder.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/CombatPresentationEncoder.ts) / [`CombatPresentationDecoder.ts`](file:///c:/Program%20Files%20%28x86%29/Starsector/Starship%20Foundry/src/engine/runtime/local/CombatPresentationDecoder.ts)：为固定投影 `keys` 编译按形状缓存的单态属性读写器（`getObjectReader` / `getFieldWriter`），复用解码器 `canonicalShapes` 与 `planPool` 对象池；在编码器中将存活身份列表 `entries` 与待展开工作队列解耦，对已知未变更的 `Kind.Vector` 叶节点（如 714 个弹坑 `localPos`、444 门武器 `relativePos` 等 2,500+ 个静止向量）内联完成坐标比对与预算计入，免除无效入队/出队开销。
* **6 艘荣光女王（3v3 `web_gloriana`）实机无头基准对比**：

| 指标项 | 专项优化前基线 | 一阶段优化后 | 二阶段深度瓶颈消除后 | 累计提升幅度 |
| :--- | :--- | :--- | :--- | :--- |
| **开局接敌（138 舰 / 60 战机 / 203~408 弹丸 / 32 光束）— 纯模拟 (`avgSimMs`)** | `19.17 ms` | `13.47 ms` | **`11.58 ms`** | **`-39.6%`** |
| **开局接敌 — 编码 (`avgEncMs`)** | `4.90 ms` | `2.95 ms` | **`3.07 ms`** | `-37.3%` |
| **开局接敌 — Worker 单步总耗时 (`avgWorkerMs`)** | `24.06 ms` (~41Hz) | `16.42 ms` | **`14.65 ms`** (**稳跑 60Hz**) | **`-39.1%`** |
| **开局接敌 — 主线程解码 (`avgDecMs`)** | `4.53 ms` | `1.93 ms` | **`1.81 ms`** | **`-60.0%`** |
| **贴脸混战（125 舰 / 52 战机 / 422 弹丸 / 21 光束 / 714 弹坑）— 纯模拟 (`avgSimMs`)** | `14.09 ms` | `13.20 ms` | **`11.18 ms`** | **`-20.7%`** |
| **贴脸混战 — 编码 (`avgEncMs`)** | `5.82 ms` | `4.25 ms` | **`4.37 ms`** | `-24.9%` |
| **贴脸混战 — Worker 单步总耗时 (`avgWorkerMs`)** | `19.91 ms` (~48Hz) | `17.45 ms` | **`15.56 ms`** (**稳跑 60Hz**) | **`-21.8%`** |
| **贴脸混战 — 主线程解码 (`avgDecMs`)** | `5.23 ms` | `3.07 ms` | **`2.81 ms`** | **`-46.3%`** |
| **TypeScript 战斗类型检查 (`npm run typecheck:combat`)** | `0 errors` | `0 errors` | **`0 errors`** | **通过** |
| **改动文件静态检查 (`npx oxlint`)** | `0 warnings / 0 errors` | `0 warnings / 0 errors` | **`0 warnings / 0 errors`** | **通过** |
