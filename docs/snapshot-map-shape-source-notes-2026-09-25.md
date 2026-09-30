# 大快照接收对象形状：修改前边界（2026-09-25）

- 本机原版为 0.98a-RC8。已读取 `../starsector-core/data/config/settings.json:8–9`（vsync/60 FPS）及 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16–50`（位置、速度、朝向、角速度、命中点）。预期是原样保留战斗状态；本轮只改变 Web 传输数据的 JS 内存表示，没有原版联机二进制格式可对照，不声称原版网络实现等价。
- 默认 display-v1 在 BoundedSnapshotReader.map 中逐项给空对象增加属性；大对象在 V8 中可能退化为字典属性。下游 unpackDisplay 的 Object.entries 和完整定义校验照常执行。本次不重复已经失败的标量递归拆分或描述符 guard 重排。
- 候选：17–256 项 map 先保存成功解码的键值对，再用 Object.fromEntries 构造完整形状；小 map、超大 map 仍走原路径。临时列表只随成功解析增长，不按攻击者声明一次预分配，不缓存帧数据、不做对象池。所有键、深度、累计 slot、字节、typed block 和旧 UTF8/error fallback 保留。
- 兼容边界：重复键最后值覆盖且枚举顺序不变；普通 Object.prototype、自有数据属性标志、每次独立所有权不变。值解码后如果 key 出现在 Object.prototype 上，立即将已读安全项物化并回到原顺序赋值，保留继承 setter/只读字段行为（包括嵌套值修改原型）。不把 fromEntries 绕过 setter 当作性能优化。
- 验证：现有 shared-snapshot-codec 加冻结旧工厂对照，覆盖大小边界、重复/整数/Unicode key、descriptor/原型、畸形与预算边界、嵌套副作用及缓存/transfer 隔离。既有64舰完整CPU场景冻结前后 source graph，ABBA四轮，无 profiler，逐帧 wire hash/完整末态接收图相同。收益以 decode+apply 与完整五段判断，失败只回退本候选精确补丁。
- 无桌面/原版实机操作，无画面或 UI 更改；不声称浏览器 FPS、真实网络 RTT 或输入到画面改善。display-v2 和默认完整 presentation Worker 均不启用。不提交、不发布、不打包，版本保持0.2.11，不覆盖生涯WIP。
