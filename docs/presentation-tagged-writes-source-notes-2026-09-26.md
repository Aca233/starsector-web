# 成对标量写入：修改前证据与约束（2026-09-26）

上一轮避碰扫掠边界优化是已验收进展：模拟均值-3.60%、Host交付-1.59%，本轮核对其文件hash未改变。总目标继续。重新读取AGENTS，不用子代理/桌面。

## 原版与当前证据

本机原版0.98a-RC8；重读decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8–10的实时位置、速度、朝向接口。原版没有Web Worker显示图协议。本轮不改变玩法、界面、频率、实体/字段、精度或网络规则，不做原版实机/视觉等价声明。

最新已保存CPU定位 current-hotpaths-post-patches-20260926 中captureGraph self335.842/inclusive775.039ms（60tick）；这是热点定位，不是A/B收益。Encoder源码与采样时及上一接受ObjectPatch的hash一致。当前每个带标签值调用scalar两次，scalar同时携带ObjectPatch字段跟踪逻辑；Vector/Typed未带标签数字也经过同一通用闭包。

## 与已失败方案的区别

不是之前owned-scalars的primitive跳过instanceof/已变化后跳过Object.is组合，不复活shape缓存、seal+keys、按行buffer预留或decoder overlay。候选只把两次通用闭包调用融合成一次tagged(tag,payload)，另保留无标签数字的scalar。不增加权限门或对象池。所有字段与两个半值仍逐次比较、按原顺序写入；特别不使用短路跳过第二次Object.is。

保留tag的比较→变更标记/changedFields去重push→tag写入→payload比较→标记/push→payload写入的顺序，兼容Object.is/Ship.hasInstance访问器、回调、更换Object.is、Array.push及异常。两个变更块有意保留重复代码，不把push延后，不依赖原生intrinsic身份。无标签路径只用于Vector/Typed，此时trackFields必为false，故去掉不可达字段跟踪分支而非安全检查。

BFS、ID、别名/环、键顺序、所有预算/类型/禁止键检查、ObjectPatch格式与选择条件、UI/LAN全行格式、失败epoch保持不变。诊断字段计数器必须同时识别旧scalar和新tagged，避免工具漏报。

## 验证计划

先冻结最新完整源图；前后只差Encoder生产文件。扩展既有render-projection的成对写入合同与旧Encoder同realm逐包字节比较，涵盖tag/payload单独及同时变化、稀疏/稠密补丁、-0/NaN、getter回调/异常/重入与诊断计数。集中一次TypeScript、改动lint、该既有场景。随后一次无profiler的200舰150预热+180tick串行Host配对，全显示/权威/隐藏火控/RNG核对；不以运算量或profile百分比冒充提速，没有稳定净收益就精确撤回本轮生产改动。

## 实现后集中验证

TypeScript退出0（9345ms），四个改动代码/工具文件oxlint退出0（104ms），既有完整render-projection退出0（5251ms）。完整场景522564断言；额外成对写入组159046断言（包含已有ObjectPatch/Decoder合同，非独立统计试验）。专项384包、288次完整有效字节及buffer容量对照；render/UI每帧新旧诊断计数一致。6类回调顺序对照覆盖Object.is方法/访问器、比较中替换方法、同encoder重入、Array.push改变写入结果以及比较异常；比较每次回调看见的私有半写入历史，而非只核对最终包。

ObjectPatch相关原场景同时核对24帧、112补丁行及12类拒绝；全场景保留额外的增删键、旧packet.shape.keys修改、metadata/预算、typed resize别名重绑和失败epoch合同。这里没有省略安全检查或放宽误差。

首次文件变换的泛化正则找到8对scalar（包含Vector的无标签坐标），计数assert在写文件前停止；改为只处理value函数内7对标签值，原Vector标量保持不动。setup-repair.json保留记录；并非测试失败或测量重跑。

新基线/候选320模块同图，只差Encoder；正式前源图与工作区一致、工具hash无漂移。正式运行无profiler/fields/stages，字段审计构建只在合同中执行，不纳入性能计时。

## 最终决定

一次真实Host配对完整状态通过，但编码+2.36%、Host交付+0.83%、交付P95+2.67%，六段有五段退化；已按原字节撤回全部本轮生产/工具/入口变化，专项合同归档。上一接受避碰优化仍在。详见同日performance报告和acceptance.json，不再重复这一成对标量方案。
