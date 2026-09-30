# 密集视觉记录的schema对象池槽位：修改前对照（2026-09-26）

## 依据
原版0.98a-RC8；重新查看本机decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8–13的位置、速度、朝向接口。此次仅改Web内部视觉打包索引，没有原版对应算法；不修改玩法、UI、粒子/拖尾数、模拟/显示频率、浮点精度或校验。未操作桌面，没有原版实机画面对照的新声明。
当前PackedVisualState.ts与artifacts/current-cost-profile-20260926冻结版本hash相同。此前采样中record自身约130.564ms、inclusive约405.732ms，dataValue约79.951ms，说明密集视觉捕获值得调查，但不能把这些时间全算给Map查询，更不能预先声称会提速。

## 现状与候选
schema集合只在模块初始化创建，不由包、调用者记录或模组扩展；扩展记录继续回退兼容图。当前每条记录在编码端查询Map<Schema,WeakMap>，解码端查询本帧和上帧的Map<Schema,Map>；这是固定、有限schema到对象池的间接层。
为内部schema分配连续只读slot，改用普通数组保存对应池，保留池内WeakMap/Map和ID、逐字段动态读取、访问器/原型/未知键检查、预算、presence mask、Float64、字符串字典和严格校验。解码仍按原方式构造本帧存活池并替换旧池，失去可达性的记录照常释放，不扩大对象池保留期。
这不是被否决的Decoder共享空数组/Entry复用组合，也不重启显示shape缓存、行预留或上一轮标量分派快路径。schema identity仍用于同ID异类型验证；slot不写入协议，不增加协议版本。

## 验证方案
冻结311模块为基线，只改PackedVisualState.ts生产实现。在既有render-projection内加入同模块/同Vector2类的冻结旧PackedVisualEncoder/Decoder对照：所有schema、完整/可选值、跨schema同对象、重复ID别名、退场与重入、兼容回退和坏包拒绝。与旧编码逐包比较有效Float64字节、字段、字符串；与旧解码比较值、身份与拒绝后的状态。
完成一块后集中一次typecheck、改动文件oxlint、完整既有render-projection。正式只跑一次真实200舰、150预热+180tick固定串行三臂配对，主线程production decoder及完整权威/RNG/显示审计保留；冻结前后，速度测量不加profile或额外计数。若目标开销或交付无足够净收益，按hash恢复唯一生产文件，不择优重复。
