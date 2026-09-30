# 闭合Worker显示标量分派：修改前对照（2026-09-26）

## 来源与定位
本机0.98a-RC8，重新读decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8–9位置/速度实时接口。Web显示图编码没有原版对应算法；本轮不改玩法/UI/更新频率/实体/精度，不操作桌面，无原版实机声明。
当前200舰150预热+60tick的无头Worker CPU采样见artifacts/current-cost-profile-20260926：captureGraph自身约368ms、value约146ms、scalar约69ms；value的两个采样节点共93次hit，其中45个line ticks落在每值instanceof Ship的语句。完整Worker GC约340ms不能全部算给编码。profile包含审计/采样开销，不能作为正式提速比例。采样所用Encoder与修改前当前文件hash一致。

## 候选及所有权证明
只给已由FireControlQueryRoster.ownForWorker登记的封闭Worker引擎启用；命令只能传数据、没有调用者Ship/函数/Proxy引用，也没有可执行插件入口。UI和普通公开引擎不获得该资格。
仍须每次captureGraph检查Ship的默认Function原型/无自有Symbol.hasInstance覆盖，以及Object.is为导入时确认的原生方法。自定义方法或访问器保持旧路径；此域不是同realm恶意脚本沙箱，未来引入可执行Worker插件时须重新审核/撤销。
优化一：在该纯读取域里，原始值不可能是原生Ship实例，不为每个number/string/boolean/null/undefined做instanceof；对象/函数仍做原检查，真Ship投影和拒绝规则不变。
优化二：私有snapshot.values数组没有调用者访问器；节点一旦确定需要发布，后续标量仍完整读取/写入，但不再做对最终布尔值无影响的Object.is比较。未变化节点仍逐值比较，-0/NaN等保留Object.is语义。普通/UI路径保留旧调用次序，包括自定义intrinsic回调。
不更改BFS/ID/removed次序、节点种类、键序、shape/字符串字典、metadata、visuals、所有预算/类型/禁用属性校验或失败epoch规则；不重启已否决的shape缓存、行预留或decoder复用候选。

## 验证计划
冻结当前完整图，只改Encoder生产实现。扩展既有render-projection：普通/owned同引擎及冻结旧Encoder逐包字节对照，全部标量/集合/typed/vector、增长/收缩/别名/环、同tick捕获、退出/重新进入、坏值/坏原型/禁止键/失败epoch；UI禁止自动获取快速权限，自定义Ship.hasInstance/Object.is/访问器回退与调用次序。
完整实现后集中typecheck、改动oxlint和既有场景。正式速度只做一次200舰、150预热+180tick固定串行前后配对，完整权威/显示/RNG校验保留；另做默认模式短激活/恢复审计，不用它的插桩耗时证明收益。无净收益则按hash恢复生产候选，保留证据，不覆盖并发改动、不择优重跑。
