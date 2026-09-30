# LAN 快照处理定位与编码候选验收（2026-09-25）

## 结果
**本轮没有保留新的生产性能改动。** 编码器候选通过正确性测试，但无profiler的完整CPU配对没有收益，已从本轮精确备份恢复 BinarySnapshot.mjs。上一轮生产LAN火控优化保持原样，生涯和其他WIP未改。保留3个编码回归及独立旧编码器导入能力，不发布、不提交。

## 定位
沿用已有 build-authority-cpu-probe / benchmark-authority-cpu 场景，默认display-v1、64舰（2 Onslaught+62 Hammerhead）、seed917、240固定1/60预热。一次120tick、500us采样仅定位热点：visit约504ms、assertDataField约486ms、unpackDisplay约445ms累计self采样，接收apply最重。不是每帧延迟，也不把带profile数据用于优化收益。

查阅既有 display-validation-performance-2026-09-25 后排除两条已失败路线：递归validator分离、guard自有属性重排。当前采样到的所有record形状也已在既有生成表中，不能将添加重复模板冒充新优化。本轮未修改校验器，未启用display-v2，未降低验证/数据/频率/精度。

## 实现过的候选
仅 BinarySnapshot.mjs：map循环直接分派标量；fast array补充字符串/布尔直写。完整保留原Number/string合法性、深度、key、两遍getter、iterator、fragment cache、数值宽度、tape sounds和buffer所有权。只是省去这些标量的递归doEncode调用，不是缓存或删校验。候选另存为 `BinarySnapshot.rejected.mjs`，不能作为当前生产代码引用。

## 一次ABBA完整CPU对照
前→后→后→前，共4个新进程，2轮/臂、每轮240预热+240测量、每帧capture→encode→decode→实际LanDisplayWorld apply。无profiler，所有轮次均保留。两臂冻结301个输入，只有BinarySnapshot.mjs不同；不含渲染、Worker IPC、实际计时器、socket/relay和输入事件。

| 阶段 | 旧均值 ms | 候选均值 ms | 变化 | 旧P95 ms | 候选P95 ms |
|---|---:|---:|---:|---:|---:|
| simulation | 12.3377 | 12.2230 | −0.93% | 19.9610 | 18.5763 |
| capture | 6.5310 | 6.6470 | +1.78% | 9.1165 | 9.4766 |
| encode | 5.2377 | 5.3320 | **+1.80%** | 6.9372 | 7.3166 |
| decode | 2.9773 | 3.0333 | +1.88% | 4.9071 | 5.0169 |
| apply | 16.0882 | 16.1242 | +0.22% | 19.0185 | 19.4292 |
| decode+apply | 19.0656 | 19.1575 | +0.48% | 22.7181 | 22.5553 |
| 权威三段 | 24.1064 | 24.2020 | +0.40% | 32.6510 | 32.4298 |
| 全部五段 | 43.1720 | 43.3595 | **+0.43%** | 53.2355 | 52.9026 |

编码两轮旧值5.1198/5.3555，新值5.4910/5.1731，方向不一致。总体没有净改善；不能抓住未改动模拟阶段下降或一次较低最大值声称成功。未追加真实Worker跑分寻找有利样本。

这组64舰不同于上一轮120 Dominator主机Worker，不能比较两轮绝对模拟时间。19.07ms是Node环境的生产解码/接收代码CPU耗时，不等于浏览器主线程long task、真实网络RTT或输入到画面。

## 正确性和回退
- Typecheck通过；集中lint发现新增测试重复导入SnapshotTapeWriter，修复后相应文件lint通过，未改运行时来绕过测试。
- 既有check-shared-snapshot-codec共13项通过，包含3个新回归。独立旧源通过data-module载入，依赖解析到相同生产模块，因此PackedSnapshotNumbers没有复制成不兼容类型。
- 新覆盖：全部scalar/type/depth边界，map getter两遍读取及第二遍修改、Proxy枚举/描述符/GET顺序、禁止key必须零GET、重入encode、失败后复用、transfer独立性、tape声效根depth和surrogate fallback。
- 四轮均为159908567 bytes，峰值320 projectile；逐帧累计wire SHA256均为 `7c9f3591e161caf4011df4db5e35de922b4a6d36d36571702eb99ff5d1b524e3`。
- 四轮完整末态接收图摘要均为 `51597611e81c2176766e5d68cef4b1e77eedf4c197ebecc6bd8c2f498e67d93a`，包含原型名称、特殊数字、typed data、Map/Set、别名、循环及自有属性标志。这不是任意历史或视觉等价证明。
- 先验证候选当前hash，保存候选后只恢复该文件，不用git reset/checkout。回退后 **656个非生涯生产模块与本轮开始完全同hash**，无额外源漂移。生产host.worker保持 `94fe6cb5cd7e576ac46cfed255d024b16da15aafe02a248f6b31975ba7cff891`。
- 回退后仅定向复查新增3项，全部通过，没有再跑一套性能以挑选数字。

## 下一步边界
当前高成本不仅是权威火控，接收数据图恢复也是独立开销。已有LanPresentationRuntime/OffscreenCanvas能力及HUD/control端口仍没有完整默认跨线程连接；若继续大块优化，优先完成它们的生产Worker消息/lifecycle、HUD/map/deployment传输及网络同步连接，避免“解码Worker→整幅恢复图复制回主线程”。保持全部校验和画面；未连接完整路径并量到收益之前，不宣称迁移已完成或默认启用。

## 证据
`artifacts/lan-snapshot-traversal-20260925/`：profile-before及摘要、baseline/candidate CPU冻结程序与source maps/301模块hash、before-a/after-a/after-b/before-b全部样本、comparison.json、两个编码器源文件、656模块baseline-sources.json、restored-source.json、typecheck/lint/check日志。修改前来源见 `lan-snapshot-traversal-source-notes-2026-09-25.md`。
