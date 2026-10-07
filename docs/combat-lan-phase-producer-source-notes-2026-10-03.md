# LAN真实Worker接入既有phase读路径

## 原版与最小对照
原版0.98a-RC8 core/decompiled缺失，源码/实机/UI待核实。此块不改玩法/UI，只接Web现有local Worker读优化。
- local-combat.worker:39,69已有ownForWorker+enableWorkerOwnedPhaseReads；host.worker:639–641只有ownForWorker+可选motion。Ship.ts:763既有isPhased单slot优化未在LAN使用。
- LAN真实MessageEvent/MessagePort只接受数据（init match、input、deployment、controls），authority engine只存本Worker，不发Ship/组件引用，不加载可执行mod脚本；world由createLanWorld构造，具体函数见host.worker:587–641,680–755与network/LanWorld。和local已用域相同。未知inline/展示/公开API realm不调用该开关。该开关不是抗同realm恶意monkeypatch沙箱，也不承诺允许未来Worker脚本扩展。
- 预期：同isPhased/getShieldCenter/phase callbacks、每步状态和随机数不变；只免除原生single-slot allSystems的slice+新array。单槽位路径先snapshot primary/defense再调用phase读取，替换/递归不会偷换成员顺序；own allSystems覆写、多槽仍走旧路径。
- 当前差异：LAN未调用域启动函数，热路径每次展开临时系统数组。实际only-fixedUpdate普查20456.192次direct路径/步，对应减少同数allSystems展开（旧getter两数组），6044.658次剩余展开仍有真实消费。
- 实现：host init实际owner注册后调用enableWorkerOwnedPhaseReads，专用VITE_LAN_OWNED_PHASE_READS=false回滚。不是跨stage缓存，也不更改live phase/effect读。

## 证据与验证
既有seed917/734mount，LAN默认/开启既有路径/开启+BODY计数三bundle，270 raw/双RNG/20790 AI防御/195934tracker严格一致；实际fixedUpdate无外部capture的计数另做隔离。先测uninstrumented ABBA整步33.441→32.481ms（单轮观察，非60Hz或全面根治），独占本任务重型活动。接入后和当前storage候选一并集中app tsc/改动文件lint；补单slot callback替换、allSystems own覆写/多槽原路径对照及真实host启动调用位置检查。不给任意caller启用，不改dt/调度/实体规模/ms算法。
