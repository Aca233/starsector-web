# 武器显示共享条目的单次登记：修改前对照（2026-09-26）

上一目标轮是证据进展：成对标量写入被真实Host配对否决并精确撤回。当前核对恢复文件、已接受避碰与320模块图一致；本轮不再调整scalar/typeof分支，改查投影重复工作。AGENTS重新读取，无子代理或桌面。

## 原版与现状证据

本机0.98a-RC8，重新查看decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java:158、185、262的当前角度/位置/规格接口。Web显示字典无原版对应实现，不改变玩法、UI、频率或精度，不宣称原版实机/视觉等价。

RenderWeaponDictionary对每个可变WeaponSpec都逐项读取、验证、比较显示字段，再按值共享immutableCopy创建的独立深冻结条目。不能把源WeaponSpec视为immutable，也不能按weapon id缓存。最新CPU诊断该project self约67.727ms/60tick，样本多位于函数入口，不能据此断言具体Map操作耗时。源码能确定：同一发布中许多source.sample.entry已经是live表中的同一个canonical条目，但每次仍live.get/retained.get/live.set。

## 候选与证明

每个私有Interned条目加一个publication身份标记；每次begin和finish都生成新的空token，永不依赖可回绕计数器。project仍先执行所有原字段/颜色/MIRV读取、Object.is与类型校验；仅当sample未变且entry已成功登记于当前token时，直接返回同一immutable spec，省去重复字典查找/写入。首次、字段变化、旧源重入、跨发布都保留原canonical查找顺序。

标记仅在live.set成功之后写入；begin清理live、finish交换/清理live后均更换token，覆盖begin重复、finish重复、没有begin的project等既有用法。entry从未外露给显示消费者；token为空，不保留世界/源/历史图。仍有原来的WeakMap源采样和两张intern Map，未新增Map/对象池，未绕过源读取或检查。内部Map操作数量有意改变，不把私有容器调用视为外部回调API。源getter导致begin/finish或重入project必须保持原结果/读序。

源图投影和experimental ShipDisplayLane共用此字典（该模块注明不是LAN HUD/prediction协议，不能冒充默认联机链路），因此除本地Worker全图对照，也需核对可靠显示通道的字节/ACK/reset与定义身份。未修改协议或任何接收端验证。

## 验证计划

冻结最新完整图，只改Dictionary生产文件；扩展既有render-projection，加载同realm旧Dictionary及旧ShipDisplayEncoder（仅替换字典依赖）。覆盖逐字段变更、同帧源变化、spec共享/分裂/重新合并、退休/空帧/重入、各种begin/finish顺序、特殊数字/颜色/MIRV、拒绝/恢复及源getter回调/重入。操作计数只证明去重，不算速度。集中一次typecheck、改动lint、既有场景；一次无profiler的200舰150预热+180测量Host配对。完整交付无稳定收益则精确撤回，保留证据。

## 集中检查及唯一具体失败

TypeScript一次退出0（9005ms），三处代码/脚本lint退出0（103ms）。新合同首次进入实验性ShipDisplayDecoder时，被其真实声音资产检查拒绝：测试尚未初始化AssetManager，burn_drive_activate.ogg虽在实际manifest中但未加载。完整原有render场景尚未执行。

仅修测试初始化：通过生产AssetManager.loadManifest加载实际public/game-assets/asset-manifest.json的数据URL，不替换validator、不伪造清单或资产。保留失败core/log并使用contracts-fixed新目录，定向补两份脚本lint和该场景；未重跑typecheck，生产候选无变化。复查lint/场景均退出0，完整原场景506941断言。fixture-repair.json记录故障/修复。

专项59个分组断言比较4636次投影的完整spec/规范身份与字典存活大小轨迹；getter/回调4种、拒绝重试3种。内部Map get 4771→333，set 4636→198，仅为去重可达证明，不是加速百分比。实验性可靠显示通道24个包逐字节一致、18次解码一致、6次ACK与reset/跳帧行为一致；未测真实LAN延迟，也不声称其为默认LAN发布通道。

正式配对使用320模块完整冻结，唯一生产差异Dictionary，前置源图/工具hash无漂移；不插入计数器。

## 最终验收：否决并恢复

唯一正式配对编码均值+3.45%，六段均未改善；Host交付均值+1.54%、P95 +1.74%，五段退化。正确性通过不代表性能通过。已核对候选hash并按修改前原字节恢复Dictionary及测试入口，专项helper归档；320模块与baseline一致，上一有效避碰优化及Encoder未变。完整记录见render-dictionary-publication-performance-2026-09-26.md及artifacts/render-dictionary-publication-20260926/acceptance.json、rollback.json。未重复测速，未留下本轮生产缓存改动。
