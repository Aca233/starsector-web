# LAN 采集→编码融合：未过门槛，已撤回（2026-09-28）

## 结论

本轮实现了默认关闭的原生 display-v1 捕获 token arena 和直接 SWF2/SWF3 编码桥，不是事后把完整 Wire 再转 tape。完整内容/时序合同通过，但固定唯一 ABBA 的两对热态完整链路均退步，故全部生产代码精确恢复。本轮没有落地性能提升；不能报告真实联机延迟改善。

## 实现范围与安全边界

- 四个已有生产文件：AuthorityCombatSnapshot.ts、HostSnapshot.ts、host.worker.ts、BinarySnapshot.mjs；两个新增 CaptureWireTape 文件。普通 native 对象/数组直接入帧私有 arena，特殊列/配方/自定义数组和叶子保留旧 pack。布局 ID 仍在子节点完成后确定。
- 双声音通道、编码缓存、transfer buffer 独立；同 tick 从 fused 资格转 visual/summary/helper 时不允许复用 opaque capture。旧 binary/helper 对 opaque root 请求回退，JSON 物化已采样内容，不重复读取原对象。
- 默认关闭 VITE_LAN_CAPTURE_WIRE_TAPE，既有五个模拟实验、展示定义、presentation/AI/serializer Worker 均未启用。没有降低 Hz、精度、画质、实体数量、过载阈值或校验。
- 不涉及原版玩法/UI 改动；原版证据及对照见同名前缀 source-notes。没有原版实机验证、桌面操作、提交、发布或生涯打包。

## 验证

- 一次类型检查及改动 lint 通过；32 个已有 codec/helper 测试通过。
- 12 组结构边界和 120 棵确定性数据树：JSON、普通/快速数值编码均一致；包含稀疏洞、显式 undefined、非有限值、typed block、循环、函数过滤、伪 $record/$d、宽/长 key、Unicode、Symbol、BigInt、最大深度。
- 默认关闭组与原版基线也进行对照。真实 host init/reinit、双通道声音、同 tick 缓存复用、资格改变重采集、旧帧和 transfer 独立性通过。
- 60 完整扰动步三组比较通过：176 实体、734 挂点；权威 + 隐藏 RNG/autofire、报文逐字及接收图一致。
- 测试脚本曾错误地用候选 bundle 编码基线 bundle 的私有 PackedSnapshotNumbers；大二进制断言差异格式化占用过大，已停止该明确异常进程，改成同 bundle 编码和短首差异字节报告。另一处 reinit 断言错误要求不产生新缓存，已改成验证新引擎/新 tick、无旧缓存复用。两者不是生产性能证据；修正后的完整合同通过。

## 预登记与唯一 ABBA

固定 Node v24.13.0，2 玩家 +20 AI，三舰循环、seed917、3200DP；当前源图在实现前冻结 780 模块、候选图782模块，3498资源冻结。不是复用旧审计 bundle，不能把本轮耗时直接与旧审计比较。150冷步、120热步，完整 simulation/capture/encode/decode/apply；没有 Profiler、没有择优重跑。

门槛：热态两对各改善至少3%；冷态每对回退不超过3%；init 增量不超过 max(10ms,10%)。

| 臂 | init ms | 冷态完整步均值 ms | 热态完整步均值 ms | 热采集 ms/步 | 热编码 ms/步 |
|---|---:|---:|---:|---:|---:|
| A0 | 103.801 | 125.886 | 135.036 | 15.700 | 10.223 |
| B1 | 117.238 | 134.673 | 143.977 | 15.801 | 17.829 |
| B2 | 110.611 | 135.171 | 143.430 | 16.233 | 17.903 |
| A3 | 102.130 | 126.852 | 134.705 | 15.756 | 10.781 |

- A0/B1：热改善 **-6.6218%**；冷回退 **6.9800%**；init 增量 13.438ms / 允许 10.380ms。
- A3/B2：热改善 **-6.4769%**；冷回退 **6.5581%**；init 增量 8.482ms / 允许 10.213ms。

热采集没有形成稳定净收益，编码反而明显增加。扁平中间表示省去了部分对象结构，但符号分派、offset/间接访问和额外调用未胜过当前已优化的 Wire 遍历。这里仅能否决本版 JS token arena，不能推论所有融合或所有原生/二进制布局都无效；也不能把阶段时间与旧实验收益相加。

270帧每臂均验证完整 wire、权威/隐藏末态和接收图一致：
- wire SHA-256：`abae05311a58545f838ee4ced8d882ad222a544b2f3cb0cb55caa2bcfb46c5a4`
- authority+hidden：`2aa6f6d94348de134f25bec753c54903d22c4a0831ad773e2be5bb8a84833f38`
- receiver：`54092cd0530c0901581e3dfecb0455a3261af4415e02b93d31987072490e616f`

## 收尾

- final-state.json = rejected-restored。四个已有文件逐 SHA 恢复至本轮进入值；两个新增生产文件移除。src/network 无新 flag、token arena 或直接 encoder 分支。候选保存在 rejected-source/ 及 frozen-after.json。
- 不启动浏览器复测：离线门槛已失败。未占用桌面，原有无关 Vite 服务未停止。所有本轮测试进程已终止/退出。
- ContentValidation.ts 的 arkFighter 护盾白名单保留。没有还原其他任务的舰船、美术、Studio 或生涯文件。
- 收尾发现 2 个非本轮冻结源漂移：`src/engine/render/webgl/passes/WebGLShipPass.ts`、`src/engine/render/webgl/ShipSurfaceFeedbackRenderer.ts`；仅记录，不覆盖。

当前目标继续 active。下一结构性候选应另行建立证据，优先减少接收侧完整恢复的重复工作；不原样复活本版 JS token tape，不以对象更少代替完整链路实测。
