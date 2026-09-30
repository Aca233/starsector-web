# 撤回负收益候选后的真实 Worker 热点（2026-09-26）

此前 decoder overlay 和无竞争舰船排名候选已按配对结果撤回。当前保留 ObjectPatch 等已接受实现。本次只定位热点，不将 profiler 数字当成 A/B 性能收益。

## 诊断

既有 benchmark-real-workers：host-pipeline，serial CPU profile，200 Onslaught，150 步预热 + 60 步采样；完整源图319模块。唯一有效运行见 artifacts/current-hotpaths-post-patches-20260926。首次 preflight 引用错误汇总器路径，在启动测试前停止，修复后才有本次运行，没有重采择优。

独占桶累计：simulation 2082.591ms，display-graph 775.039ms，projection/packed visuals 305.465ms，未归属GC 86.058ms，测试权威审计41.238ms。idle 5213.510ms包含驱动器/审计等待，不是闲置算力证据。captureGraph self335.842/inclusive775.039ms；OwnedFireControlReadGuard.allows self103.052ms；aim self96.303/inclusive248.379ms；collisionRisk self65.144/inclusive83.164ms。inclusive重叠，不可相加。

210次witness、211次完整显示图、4,653,851节点及既有权威检查点一致。工具hash无漂移；运行后发现HullMods.ts、GlorianaPack.ts有其他任务改动，没有覆盖。下一候选须重新冻结最新完整图。

## 后续选择

不重试已否决的稀疏overlay、单候选排名、目标外延Map、seal+keys缓存等。避碰积分仍在每个候选、每段、每个障碍计算精确最近点；考虑增加保守的线段范围拒绝，保留原精确公式及顺序。此处没有速度收益结论，也未声称火控是唯一瓶颈。
