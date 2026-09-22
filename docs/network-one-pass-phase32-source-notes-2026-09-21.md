# Phase32 单遍有界快照解码：实施前对照（2026-09-21）

## 已核实的证据和范围
本地原版 DamagingProjectileAPI.java 的 getDamageAmount/getBaseDamageAmount/didDamage/isFading 独立；tpc_shot.proj 为 BALLISTIC_AS_BEAM、length=100、fadeTime=.3。本轮不改玩法、画面、精度或省略字段；只重做网络值解析器，不声明原版实机/UI 等价，也不操作桌面。

Phase30 的已保存 cost.cpuprofile 中 preflight 是最大单函数采样热点（340 hit），它在完整 decode 前遍历全部字节，随后 SnapshotReader 再解析一次。Phase31 的实体胶囊反而增加了重复捕获、重建与流量，明确不启用。本轮不继续该设计。

## 纵向替换
将普通完整快照的“完整结构预扫描 + 再解码”替换为**单遍校验并解码**。旧安全预扫描和解码器保留作为异常/特殊 UTF8 兼容路径，relay 投影暂不改。格式、字段、精度、协议版本、motion byte delta、Hz 和队列策略不变，LAN/Steam 同用二进制接收入口，无新协商开关。

单遍解析每次读数前验证字节边界；容器验证长度、深度、map65536上限、累计槽位不超过包字节数；大数组必须随实际解析增长，禁止由恶意声明长度直接预分配巨型数组。小数组预分配上限256，递归深度128，未完成对象只在解析器私有，失败不返回半个快照。非法键、字典范围、重复键覆盖语义、uint64/float64/NaN/Infinity、BOM/历史短UTF8行为必须保持。异常走原验证路径，保留错误类型/信息与接纳集合，不以放松断言通过测试。

## 预设验收
1. 保留修改前完整 BinarySnapshot.mjs 和 SHA；不以近似代码作对照。
2. 256 tags及截断、随机变异、深度边界、超限容器、危险/重复字典键、UTF8、ownership与偏移视图差分；合法fixture必须直接单遍成功，不能用静默fallback冒充。
3. 原生22舰同源轨迹，3/5离线副本，A/B、B/A，30预热+至少120实测tick；capture/encode/delta/compress/inflate/decode/apply全计入。字节完全相同；两方向总P50至少改善5%，P95不恶化超过10%。若不通过不启用，保留负结果。
4. 通过后默认接线，跑网络/共享/Steam回归与冻结源码无头LAN真实3/5人路径；不把离线总CPU、loopback当实际Steam RTT或n2n60Hz。

不碰生涯/并行AI改动，不提交发布。此方向是解码层替换，不是已经完成全套实体网络架构重写。

## 2026-09-22 扩展：本机 DTO 恢复的分配替换（编码前记录）
前三个单遍解码候选均保留负结果：native-tags 虽解码约快17–20%，全管线每对>=5%门槛未全过，尚未接线。继续改一段已定位的工作而非降低门槛：CombatSnapshot.unpack普通对象用Object.entries为每字段分配临时二元数组；已知本机模型 + JSON/二进制/structured clone DTO 可用Object.keys并直接取字段消除此分配。
新增显式nativeProjection调用合同，仅createLanWorld拥有的非Proxy/无自定义访问器目标、网络普通DTO帧可启用；默认API和任何不能保证此合同的模组调用维持旧Object.entries，保留getter/Proxy遍历语义。嵌套字段仍走完整unpack、SKIP、深度及标签校验，不能跳字段恢复。实际LAN/Steam共享LanBattle默认调用点须显式启用才算完成。单帧和批量、稀疏状态、目标容器复用、回调顺序须与原恢复对照。新组合仍用原门槛、同源完整管线，不以局部解码数字代替总收益。
