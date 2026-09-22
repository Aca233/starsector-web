# Phase 9：共享粒子快照压缩，及仍未消除的整包积压

日期：2026-09-21。范围：LAN / n2n / Steam 使用的共享 authority capture 与恢复路径。没有修改生涯模式，没有提交、打包、推送或发布，也没有修改网络适配器、n2n、系统或防火墙。

## 本轮结论

- 已实现并接入共享 host Worker 的动态粒子压缩；LAN、Steam binary、Steam legacy JSON 和 dedicated Node adapter 共用，不是另建 Steam 特供快照格式。
- **不是“彻底解决”**：五人 4Mbps/60ms 回放最差完整世界 age P95 仍为 **2736ms**，超过现有 1500ms 世界陈旧保护。没有放宽保护、伪造 ACK 或调高显示 Hz。
- 同一原生 Web 22 舰权威录制，完整压缩状态均值 **68059→63707 B（-6.39%）**；弹体另通道时的完整状态 **49521→45268 B（-8.59%）**。另一个真实 22 舰 native-capture 测试样本总量 **558101→506006 B（-9.33%）**。不是带宽或延迟同比下降的承诺。
- 增加了 CPU 代价，未隐瞒：配对记录 capture P50 **2.71→3.19ms**、P95 **3.96→5.10ms**；最终 Chromium 还原 P50 **2.30→2.60ms**、P95 **3.30→3.40ms**。不同样本/轮次不能拼成端到端耗时。

## 为什么不是改压缩级别或删除特效

`bulk-shape-phase9.json` 对旧记录做了诊断性字段消融。168849 原始字节 / 51188 deflate-1 字节的世界中，`fxSystem` 平均占约24811可压缩字节，特定重载帧约37012。伤痕、武器控制、装甲也有成本，但不能据此删除它们。

更高 deflate、Brotli、Zstd 在过时大差分上收益有限。无条件 XOR literal 的试验反而更大。这些实验都没有进入生产路径。早期 seed-only / 不带 burst / 不带权威 motion 的记录保留在工件中，**不能用于最终收益宣称**。

## 最终格式及安全边界

`DynamicParticleRecipe.ts` / `ParticleRecipeKernel.ts` 只表达现有 armor smooth、debris、sparks、explosion-burst 对象，不修改源生成器、密度选择、随机序列、更新或死亡规则。出生时旁路记录 RNG cursor/参数及成员编号，精确固定步长后记录步数。抓取时逐字段/类型/自有数据/浮点比对私有重放模板，任何修改、accessor、非原型 RNG/Vector2、非1/60步长或超限对象回退普通状态。

```
{$dynamicParticles: [1, recipes, rows]}
recipe = [1, kind, cursor, x, y, parameter, red, green, blue, speed, category]
row = [recipeIndex, originalMemberIndex, fixedSteps, [authorityX, authorityY, authorityVx, authorityVy]]
   or {raw: ordinaryPackedRow}
```

**关键失败修复**：Node-only 一致性通过后，Chromium 实测发现 `sin/cos` 最末位差异。不能宣称种子重建天然跨端无损。最终四个 motion 标量由权威发送，避免 `sin/cos/exp` 导致的位置/速度差异；其余 life/alpha/size/rotation 按原算术还原。客机不再重复积分将被替换的 motion。不是量化，不引入误差容忍。

每帧128组、4096成员/行、256步、262144成员步；抓取按**冷客机**成本收费，不按已经暖好的房主缓存收费。原始成员数量也受限，防止只剩少数存活成员的组挤爆缓存。被部分更新而步数不一致的同组成员回退普通行，避免一帧反复倒带。模板不暴露给客机，回退行的原有祖先环处理保留，恢复数组顺序/删除一致。

已有 motion-reference 字节预测器将该集合视为不透明数据，但继续处理其余普通 FX/弹体；损坏或混入多余 envelope 字段仍回退。最终 authority capture 开关由共享 Worker 显式传递，通用/custom capture 默认仍旧路径。

## 启用与兼容

- 共享 host Worker 默认启用这项**快照表示**优化，包括 Steam 和 LAN。
- `VITE_LAN_PARTICLE_RECIPES=false` 在构建时可恢复普通粒子表示；独立 Node builder 也读取同名构建环境变量。
- LAN/Steam 既有 build 身份检查仍在；不同构建不能混房。既有 wire codec、权限、receipt、重同步流程不变。二进制和 JSON 都可以承载自包含 envelope；不存在跨快照基线依赖。
- **Phase7/8 的 layered motion / critical combat helper 仍是单独的默认关闭实验开关**，本轮没有把它们偷偷设为 Steam 能力或生产默认。

## 跨端与渲染验证

- `native-particle-final-phase9.log`：**20/20**。包含既有12项和粒子出生/中途/消亡、密度选择、全部 burst 分支、原型/字段修改回退、恶意 envelope、缓存隔离、冷预算、部分组更新与环处理。真实22舰、完整恢复对象对照，权威 RNG 不变。
- `particle-browser-enabled-phase9.log`：**27个完整世界还原逐字节一致**，6个640x360实际 WebGL FX画面逐像素一致；输入是Node生成的两套二进制，不是在浏览器里重做两遍同一算法。画面有非零可见像素；无 page errors。无头环境，不代表用户硬件FPS或原版实机UI等价。
- `network-gate-enabled-phase9.log`：**364/364**。
- `shared-codec-phase9.log`：**6/6**。
- Steam全门禁 `steam-gate-phase9.log`：**324/326**。历史两个 experimental Sockets 用例仍失败：120s崩塌/3s暂停后的最慢客机吞吐；九客机健康链路每人≥40Hz。没有降低断言掩盖它们。
- 原版证据及差异边界见 `network-dynamic-particle-source-notes-2026-09-21.md`；未进行用户禁止的桌面操作。

## 五人配对回放：有收益，也有代价

文件：`particle-lan-ordinary-final20s.json` / `particle-lan-recipe-final20s.json`。同一22舰录制，4个独立guest进程，真实loopback WS/deflate/TCP，一个FIFO共享下行；20秒、去前三秒。运动/视觉/关键战斗/分块通道均启用。它测传输和解码，不执行真正游戏apply/render、n2n、Steam或丢包；合成输入echo不等于input-to-photon。

| 条件 | 普通表示 | 最终表示 |
|---|---:|---:|
| 4Mbps / 60ms：motion Hz | 49.47–49.71 | 49.41–49.82 |
| 4Mbps：critical combat Hz | 20 | 20 |
| 4Mbps：最差完整世界age P95 | 2934ms | 2736ms |
| 4Mbps：完整世界Hz | 0.41–0.47 | 0.41–0.53 |
| 4Mbps：最差合成输入echo P95 | 128.56ms | 127.42ms |
| 32Mbps / 20ms：motion Hz | 58.35–58.65 | 58.41–58.65 |
| 32Mbps：完整世界Hz | 4.18–4.41 | 4.12–4.29 |
| 32Mbps：最差完整世界age P95 | 133.72ms | 159.05ms |

健康链路完整世界age有回退，不能只摘弱网改善。只有单次顺序对照，不是统计显著性或全硬件结论。压缩只能减轻整包负担；其结构性陈旧问题仍需继续处理。

## 后续重点 / 完成条件

1. 独立运动及HP/幅能/护盾/死亡已经不能代表剩余世界全部及时。武器/装甲/系统/crafts/部署/光束/爆炸等仍受整包约束，需要有明确引用依赖、时钟和可靠回退的组件同步；在此前不能移除完整世界活性保护。
2. Steam experimental Sockets 的端到端flight额度与多客机公平性必须修复并重跑原断言；不能以LAN通过替代。
3. 需要最终组件路径真实 apply/render 预算、多机器 n2n/Steam 3/4/5人验证，才能声称实际客机Hz和操作延迟问题已解决。本阶段不满足该完成条件。

## 最终接线验收与工件取舍

- 增强后的真实 Worker 集成测试发现一个接线遗漏：曾经只打开了出生记录，而 capture 仍使用默认 false。该中间版本不能算接入完成。已修复显式 capture 参数；测试不再只检查 source 文本或容器可传输，而是要求实际运行时出现 recipe。
- **最终有效**的 `shared-authority-enabled-phase9.log`：三种能力模式分别跑到至少780 tick，均实际捕获 **158个 recipe 行**，同时通过 LAN envelope、Steam binary/full/delta、legacy JSON/full/delta、dedicated summary 原格式回环。它不是 native Steam 链路实测。
- **最终有效**的 `worker-particle-enabled-phase9.json`：22舰真实生产 Worker、12秒、200ms整包消费延迟、motion+combat：物理 **60.04Hz**，整包抓取 **4.72Hz**，motion718帧、combat241帧，无errors/recoveries。
- `worker-particle-on-unthrottled-phase9.json`：22舰、不加消费延迟：物理 **60.02Hz**，完整抓取 **59.77Hz**，无errors/recoveries。这只是Worker吞吐，不是客机FPS或网络Hz；低端/更多舰船仍须验证。早期off/on Worker工件的打包方式、接线状态不同，**不得据此声称CPU同比改善**。
- `tsc-enabled-phase9.log`、`lint-final-phase9.log`：app TypeScript与本轮相关源码lint通过。官方Node worker-only builder依赖图没有campaign输入；这只是后台测试bundle，不是发布包。
- `shared-authority-final-phase9.log`保留了接线断言失败；`worker-particle-final-phase9.json`以及更早的on/off Worker结果不能替代上面的enabled工件。Node配对录制和浏览器还原测试一直显式传true，因此其同源包体和跨端一致性结果不受该接线遗漏影响。
