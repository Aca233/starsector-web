# Phase21：客机渲染减负与联机回归（2026-09-21）

## 结论与范围

本轮两项优化已进入默认渲染路径，LAN / Steam 共用，不需要用户开实验开关：
1. 完全离屏的船体伤痕、热光、过载覆盖层不再生成 Canvas / 上传纹理 / 提交绘制。判定采用实际旋转船体四边形、pivot、Float32误差和2屏幕像素余量；舰炮、引擎、排气不随船体误裁剪。重新进入画面仍使用最新权威伤痕和本地效果时间。
2. SpriteBatcher 在选择纹理和触发批次刷新前保守剔除完全离屏精灵，保留可见绘制顺序、混合方式、原始贴图、伤害与随机序列。
3. 会话日志增加 hud.renderCulling（字段详见下文），明确记录两个开关与真实剔除数量，不能仅以“存在代码”证明启用。

本轮没有改网络信用窗口、虚假ACK、HUD Hz算法、伤害/碰撞/AI权威、模拟目标；不是通过降画质或降低模拟频率减少负载。它减少各客户端（包括房主画面）的渲染阻塞，让接收/输入有更多主线程时间。它不会降低n2n/Steam线路本身的传播RTT。

## 真实渲染器像素与工作量

使用生产 WebGL 渲染器，注入22舰伤痕/过载及一个裁切残骸，640×360、RTX5060/D3D11。8种相机/缩放/边缘/重入场景，开关前后逐字节比较：**全部0像素差**。人工查看保存图也确认不是空白画面。几何单测6项，含各10000次随机船体与sprite变换，无错误剔除。

最终相同源码图的注入渲染探针（含 GPU finish）：
- 平均单次绘制：**21.57 → 3.45 ms**。
- 累计动态纹理上传：**2621 → 243**。
- 这是大量离屏受损舰船的局部压力探针，不能称为整个游戏/网络延迟降低84%。
- Phase20本地粒子显示回归也逐帧0像素差，未因精灵裁剪破坏本地/原路径的画面一致性。

证据：artifacts/network-stream-20260921/phase21/cull-webgl/result.json、particles-regression/result.json。

## 五人真实联机配对（同一机器、同一seed、固定浏览器源码图）

真实 LanBattle + host Worker + 五个独立桌面helper + WebGL，不是只跑socket模型。22舰，seed917，12秒测量。顺序 on → off → on → off；关掉的是本轮两项裁剪，之前优化保持一致。所有四次完成断开/关闭回收，无浏览器错误。

| 运行 | 客机完整状态Hz中位数范围 | 客机FPS中位数范围 | 各客机输入确认P95范围 | 客机render采样中位数范围 |
| --- | ---: | ---: | ---: | ---: |
| on | 41–42 | 60 | 67.1–72.9ms | 4.04–4.84ms |
| off | 31–35 | 27.1–32.9 | 106.5–124.1ms | 6.14–6.61ms |
| on-repeat | 25–26 | 60 | 76.7–89.5ms | 4.22–5.15ms |
| off-repeat | 33–36 | 27.1–29.0 | 94.4–127.1ms | 5.59–5.88ms |

**画面/输入确认改善可见，但不能宣称完整状态Hz稳定提升：第二次开启运行的完整Hz反而更低。** 主机同时承载服务器、全部渲染页面及DevTools，还有其它后台工作；战斗的网络调度并非逐帧固定。完整状态吞吐的后续瓶颈仍存在，不能用FPS=60替代网络完整Hz=60。

证据：paired-direct-on/off/on-repeat/off-repeat 的 result.json、samples.jsonl；evidence-summary.json 汇总。

## 3 / 4 / 5人运行、房主卡顿与重连

全部保持22舰。3/4人各12秒测量；5人60秒持续测量，另加主线程800ms阻塞、房主retryable断线重连和正常关闭。五人长测开启Node堆采样，因此不是无开销性能基准。

| 人数 | 客机完整状态Hz中位数 | 客机FPS中位数 | 各客机输入确认P95 | 卡顿中间450ms仍发布 |
| --- | ---: | ---: | ---: | ---: |
| 3 | 49–50 | 60 | 45.2–50.5ms | 26帧 |
| 4 | 38–40 | 60 | 50.1–55.5ms | 27帧 |
| 5 | 33–34 | 60 | 89.0–97.9ms | 28帧 |

三次guest输入ACK均在真实主线程阻塞窗口内前进；重连后matchId不变、模拟继续、所有玩家仍连接，无自动退回大厅，最后cleanupCompleted=true。五人60秒权威tick从213到3814（3601步），HUD权威模拟中位约59.96Hz。**仍不承诺客机完整世界60Hz**。

证据：stress-3-final、stress-4-final、stress-5-final。

## 被撤回的实验与验收工具故障

- 客机I/O Worker完整帧解码 → 主线程structured clone：同种子对照无稳定收益，增加大对象图复制，已撤回全部生产实验代码。不把无收益开关“全开”。存档 rejected-worker-decode.patch、decode-on/off。
- Canvas willReadFrequently：100伤痕Onslaught组合+上传均值0.394 → 0.429ms，不采用。
- 早先cull-on、frozen-on两次测试Node 4GB OOM，**不算通过，也未删除失败证据**。额外heap诊断显示主要存活分配位于Playwright launchServer/connect的消息序列化代理。诊断样本堆已涨到1720MiB，随后只停止该次自有进程树。
- 验收工具改为直接chromium.launch，避免同进程远程代理复制/排队；不加大堆上限、不改线上缓冲。直接短测采样堆峰值126MiB；5人长测（含重连/回收）峰值179MiB，正常结束。增加测量阶段即时落盘、阶段日志及可选堆采样。该修复属于测试工具，不声称修复了用户游戏内同种OOM。

## 默认启用与回退

- 默认：VITE_CULL_DAMAGE_OVERLAYS 和 VITE_CULL_SPRITES 都无需设置。
- 紧急构建回退：分别设置为false；不是游戏内用户操作项。
- 会话日志 hud.renderCulling.spritesEnabled / hullOverlaysEnabled 是本构建实际条件；shipSpritesRejected 是主sprite批次本帧拒绝数，hullOverlaysRejected 是伤痕/过载覆盖层拒绝数（残骸/复制体可使其多于存活舰船数）。
- 5人长测每席均记录实际true以及非零剔除数；未知/旧版字段仍为null，不伪装启用。
- LAN与Steam使用同一LanApp/LanBattle与WebGL路径；Steam协议回归不等于已做真实Valve/n2n多人验收。

## 回归与协作边界

测试门禁以 artifacts/network-stream-20260921/phase21/final-gates.json 为准：typecheck、定向lint通过；network:check 504项、network:check:shared 120项（另含共享传输集成脚本）、steam:check 342项均通过，不同套件有重叠，不累计为独立用例数。3/4/5人共12个席位均验证实际启用且两种剔除计数非零。首轮typecheck发现新增HUD字段漏声明，已补齐；首轮网络/共享测试发现既有测试fixture尚未适配并行任务的CombatAuthority/CombatRenderView，已做**测试端**适配：使用真实权威类，投射物trace读取渲染facade，同时显式隔离source sidecar，防止比较双方误读同一投射物导致假通过。未回退/冒领并行任务的架构改动。

冻结图：
- 短测配对 SHA256 443fde01c9ea71cdd16796b0d3d5a11df0ec9e4abf6e3a06d8cd37b164128053。
- 最终压力/像素图 SHA256 3ffff714f1300d23c523586bc5aa27e393e6d3293f9b2cc2a4214ff976f51321。
- 后续仅LanBattle的HUD TypeScript类型声明有差异，不影响运行时；验证转译后内容相同。Node中转服务不在冻结图中。

原版来源证据与未做原版实机UI验收的边界：network-client-pipeline-source-notes-2026-09-21.md。本轮未使用子代理、未操作用户桌面、未改系统/n2n配置、未改动生涯内容、未提交/推送/打包/发布。因此用户已安装的版本不会自动变成此次工作区代码。
