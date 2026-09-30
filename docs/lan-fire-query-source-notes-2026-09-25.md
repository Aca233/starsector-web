# LAN 主机火控查询共享：修改前来源与边界（2026-09-25）

## 原版证据 → 预期行为
本机 0.98a-RC8；本轮再次阅读 `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:236–267`（空间候选、阵营、可见性、武器角色、精确范围/提前量/射界、指定目标优先）及 `combat/systems/WeaponGroup.java:301–315`（逐挂点 advance/shouldFire/发射）。反编译有类型异常，不能照搬。保持当前 Web 战斗结果及次序；不将现有 Web 的先决策后发射差异宣称为原版等价。不改变 UI，原版实机/视觉验收本轮未做。

## 当前差异与所有权审计
本地 Worker 已登记闭合查询域，LAN 独立 host.worker 尚未登记。此次仅扩展登记入口，不改共享算法、阈值及通用对象反射审计。

- `host.worker.ts` 的 engine/authorityRuntime/controlled 是模块私有；唯一建世界入口 init 调用 `createLanWorld`。重连复用原引擎，重新 init 创建新引擎并增加 lifecycle，取消旧 AI/编码任务。
- init、直接 authority MessagePort 及主通道只接收 structured-clone 数据。输入仅排队；部署/presence/start/stop 在事件边界运行。没有可执行插件或可变 Ship 引用外传。
- `LanWorld` → `LanDesign` → `ContentRegistry.registerShip` 先验证再 structuredClone/immutableCopy 元数据；自定义配置是数据，不能传入 getter/函数。不是把外界传入的对象直接冻结以换取速度。
- 异步 AI prepare 只发生在完整 advance 之前；generation/engine/running 检查拒绝过期任务。`CombatAuthority.advance` 与逐舰 aim/decide 查询窗口均同步，事件回调不在其间抢占；发射之前关闭共享域。快照/编码/音效只在既有边界使用内部对象或发出数据。共享完成/准入内存只有流控信号，不承载可变战斗对象。
- 现有 hasOwnedFireControlReadHooks 及引擎 nativeThreatPhase/combatEffects/方法/名单检查全部保留，舰载机/模块/自定义钩子等继续回退。WeakSet 是所有权契约，不是对同 realm 恶意插件的安全沙箱。未来增加可执行插件入口必须撤销登记或重审。

## 验证方法（修改前确定）
已冻结当前 src 非生涯源图，保留主机文件原件。扩展既有 check-multiteam-worker 的可选配对模式，而非新建测试工程。运行真实主机 Worker 的 init/start/step/snapshot/消费回执，测试构建仅替换计时器为手动单步，保持真实 step 函数及其控制、权威、发布逻辑；每步 1/60，禁止输入事件 fixture。比较相同 seed/部署的逐 tick 显示包（仅排除 simulationMs 计时字段），间隔对比完整权威快照、隐藏火控和 RNG。正常与重新 init 都检查登记；资格计数仅用短探针，不混入正式性能。

联机合法部署点数上限3200，主性能场景先定为120艘 Dominator（两队各60，若真实 DP 不能全部署则明确记录而不绕过上限）。150步预热+180步测量，前后版本交替推进；不采样 profiler，不降低精度/数量/检查。另短探针验证航母回退和重建世界。性能范围仅主机 Worker 模拟与显示快照交付/解码，不代表真实网络、渲染或输入到画面延迟；不拿本地200 Onslaught收益当联机收益。

实现一块后集中 typecheck、改动文件 lint、此既有场景；正常时钟多队场景也使用既有脚本。不为了寻找好数据反复重测，不暂存/提交/发布。

## 验证中的既有场景修复
正常计时器五队脚本仍从已拆成类型层的 CombatSnapshot.ts 导入旧 applyCombatSnapshot，首次运行明确报“不是函数”。仅修复该测试：改用生产 createLanDisplayWorld / applyLanDisplaySnapshot 显示接收器；不恢复废弃的模拟类接收路径，也不改变产品代码。修复后 0–180 tick 共181帧，每帧权威/客户端/可见舰均为5。工具环境缺少项目本地 Playwright，通过现有 NODE_PATH 指向已安装的 Codex 运行时依赖解决，没有安装新依赖。

正式包对照排除五个现有墙钟诊断字段 simulationMs/captureMs/encodeMs/realtimeRatio/combatRate（不是只排除 simulationMs）；所有其余显示、音效、ACK、部署字段做递归严格值比较，typed-array/ArrayBuffer逐字节比较。完整权威快照本身用零计时字段采集，与隐藏 tracker/RNG 一同在定时区间外比较。测试的 reinforcements 是内部存储名单（包含已部署舰），并不等于后备舰；资格断言依据真实 deployment.rows 的 deployed/reserve 状态。
