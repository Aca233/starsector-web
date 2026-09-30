# 接收校验热路径实验：两候选均撤回（2026-09-25）

## 最终状态
**本轮没有保留新的生产性能改动。** 两个候选均通过正确性检查，但完整接收流水线没有可靠改善，因此分别从本轮修改前的精确备份恢复；不是git reset/checkout，也没有覆盖之前已接受的优化、生涯或其他工作。

保留4个新增回归用例和可选冻结baseline导入能力，扩展现有`check-native-capture`，没有另建测试工程。没有降低任何校验、数据量、更新频率或数值精度。未提交、打包、发布或操作桌面，没有子代理。

## 共同测量方法
- 已有`build-authority-cpu-probe.mjs` + `benchmark-authority-cpu.mts`，冻结301个输入模块，排除campaign；每个候选相对同一个before只改变一个生产文件。
- 64舰，2 Onslaught玩家+62 Hammerhead AI，seed917；240固定tick预热+240测量；实际LAN-v1 capture→binary encode→binary decode→LanDisplayWorld restore。
- 两候选各做一组独立ABBA，每臂480测量样本。无profiler，不混合两个候选数据。不是正常联机房间容量/渲染/Worker IPC测试，不放宽房间限制。
- 每次发布包计算完整wire hash；最终接收对象图摘要包含特殊数字、typed数据、Map/Set、别名/循环和自有属性标志。
- 两组共8轮wire及完整末态接收图摘要相同。每轮240帧159908567 bytes，峰值320枚projectile。摘要相同不替代中间状态/方法覆盖的定向回归，也不是跨浏览器画面证明。

## 候选一：将标量叶子从递归validator分离
文件`DisplayDefinition.ts`。数字、字符串、布尔、null、undefined经过非递归helper，容器才递归；每个descriptor、节点预算、资源路径和错误顺序均保留，不缓存可变元数据。

| CPU阶段(ms) | 原均值 | 候选均值 | 变化 | 原P95 | 候选P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 接收apply | 13.753 | 13.637 | −0.84% | 16.503 | 16.500 |
| decode+apply | 16.278 | 16.108 | −1.05% | 19.143 | 18.979 |
| 全流水线 | 36.782 | 36.763 | −0.05% | 44.398 | 44.822 |

结论：几乎无净收益，不能以局部均值−0.84%宣称解决主线程瓶颈。已撤回，冻结源码保留为`scalar-rejected.ts`。

## 候选二：把自有字段校验从原型链循环分离
文件`DisplaySnapshotCodec.ts`。普通热字段用单次getOwnPropertyDescriptor检查；仅不存在自有字段时进入继承查找。保留禁止key、函数、getter/setter、prototype检查和每次实时descriptor读取，没有跳过校验或基于layout假定授权。

| CPU阶段(ms) | 原均值 | 候选均值 | 变化 | 原P95 | 候选P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 接收apply | 13.733 | 13.599 | −0.98% | 15.952 | 16.246 |
| binary decode | 2.513 | 2.662 | +5.94% | 2.897 | 4.595 |
| decode+apply | 16.247 | 16.262 | +0.09% | 18.515 | 19.178 |
| 全流水线 | 37.410 | 36.863 | −1.46% | 44.820 | 44.561 |

结论：接收均值没有降低、P95反而+3.58%。全流水线约−1.46%主要伴随未改动的模拟阶段−4.09%，不能归功于guard重排；binary decode源码也未改动，不将其尾部波动直接归因于guard。已撤回，冻结源码保留为`guard-rejected.ts`。不再追加普通联机跑分去寻找好看的样本。

## 正确性与保留的回归覆盖
两候选的typecheck、改动文件lint通过；第一组12项、第二组13项既有/新增回归通过。

新增4项在撤回后补足脱离baseline时也有效的明确断言，并定向复查全部通过：
1. 定义标量、各种容器/特殊对象、非有限数、资源白名单、访问器和250个确定性混合嵌套fixture，与独立冻结旧validator比较；可变range/资源路径每次重新检查，不执行getter。
2. 31–34层边界、199998–200000个数组元素（含根节点计数）、预算与类型/禁止key的错误优先级；空洞仍按原来的Object.keys语义计数。
3. Proxy的prototype/ownKeys/descriptor顺序完全一致，descriptor陷阱中途改资源路径仍被发现；陷阱重入一次满200000节点校验不污染外层预算。
4. 自有/继承data、function、getter、setter、影子字段、动态重新安装访问器、禁止key、falsy target既有行为；没有普通属性GET或getter执行。

旧/新模块共享同一个AssetManager与其他数据类型，不绕过加载和白名单检查。针对候选二，冻结旧LanDisplaySnapshot/DisplaySnapshotCodec也用于已有全显示对象图/固定record/direct-projectile恢复对照。回滚后生产图与before的650个非生涯源码逐一哈希相同，保留之前的热光读回优化。

## 下一步的约束与已核实接口
两次结果说明“重排递归/循环以期JIT内联”不足以降低全量对象图处理成本，不继续沿这条微调路线堆生产复杂度。

当前LAN `LanBattle.tsx:896–970`在同一个RAF内完成完整显示恢复、motion/开火/炮塔预测和WebGL渲染，React HUD在其后；`1093–1108`的Contacts/ShipHUD/Radar仍直接读LanDisplayWorld。若要真正利用更多CPU核，需要评估把**接收恢复和渲染共同移出主线程**，避免“Worker解码→再复制整幅显示图到主线程”的双重成本。这是下一项架构调查方向，**尚未实现/启用**。

不是直接把现有local presentation codec接到网络就完成：`CombatPresentationDecoder.apply`要求严格连续revision，现有LAN会合并/跳帧且需要冷重连；本地协议的metadata验证不等同网络资产授权。这些都必须设计并验证，不能绕过。

也不是把WebGL canvas扔进Worker即可：TextureCache目前依赖`new Image()`及HTMLImageElement生命周期，ShipDamage/ShipOverload/WebGLShipPass还创建DOM canvas；HUD多处直接引用world。下一步需以最小真实场景验证OffscreenCanvas/资源加载和小型HUD读模型的可行性，不能引入第二次完整对象图序列化，不能降低视觉效果或输入频率。原版UI及输入语义保持不变，功能/延迟收益未验证前不可默认替换。

## 工件与复现
目录`artifacts/display-validation-20260925/`：before-cpu/after-cpu/guard-after-cpu及源码映射/哈希；两组全部8轮samples；`cpu-comparison.json`、`guard-cpu-comparison.json`；三个check状态、contracts日志；候选源码与修改前备份。

现有CPU场景命令：
```text
node <冻结-cpu.mjs> --out <新目录> --ships 64 --players 2 --steps 240 --capture lan-display --packed-numbers --apply-replica
```
回归环境：`DISPLAY_DEFINITION_BASELINE=artifacts/display-validation-20260925/before/DisplayDefinition.ts`、`DISPLAY_RESTORE_BASELINE=artifacts/display-validation-20260925/before`、`NATIVE_CAPTURE_CHECK_OUT=<新输出文件>`。执行：
```text
node --test --test-name-pattern="LAN display data field|display definition scalar|display-v2|LAN display record plans|LAN display fixed record|LAN display direct" scripts/check-native-capture.mjs
```
大规模模拟/整体联机延迟目标仍未完成，保持进行中。
