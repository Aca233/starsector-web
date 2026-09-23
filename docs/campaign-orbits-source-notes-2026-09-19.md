# 权威轨道运动：原版公式与联机顺序（2026-09-19）

## 已实现

- `reference.orbits@0.1.0`，服务 `spaceMotion`；参考组合 `reference.cooperative@0.9.0`。
- `SpaceEntity.orbit` 是 provider 校验的 JSON 描述，而不是内核硬编码的原版轨道类型。换 provider 可以换轨道协议、公式和行为；不要求改 Repository/Kernel。
- 支持 `circular`、`point-down`、`spin`，显式保存 focus、半径、周期、角度，以及 spin 的朝向和角速度。没有运行时随机初始化。
- 每一权威 tick 先更新轨道实体，再给所有舰队提供同一份冻结世界；普通跳跃点可随轨道移动，接近、抵达判断与跳跃落点均读取实时位置。
- 时钟、位置、轨道相位、舰队航行、后勤、receipt/outbox 同事务；多帧在提交时折叠为每实体一次版本递增。
- 环、缺失/跨地点 focus、不支持的空间速度/舰队轨道、非法周期/数据在 provider 世界校验时拒绝。

## 原版证据

本地 `decompiled/starfarer_obf/com/fs/starfarer/`：

| 源文件 | SHA256 |
|---|---|
| campaign/CircularOrbit.java | d056d5f454f29225cf4a8b78d2e5c3437f691eb6caf0b09c1676f4540355117d |
| campaign/CircularOrbitPointDown.java | a6965504e72ec2b77b4f7a5634215600c833f5d4dba958fd2b3f2bfdd51f0fc9 |
| campaign/CircularOrbitWithSpin.java | dbcbbc967ca9131b1d2687a6c49933ed72ac6e4c1c10ef7ad94e053102ca00de |
| campaign/BaseLocation.java | 117ab6012c0a62d2f1f16de7578779d02436625f3d0f0352736ace8d09ff210e |
| campaign/CampaignClock.java | 00c00d08296811f9d3031a35660ddd9c7fdc652eae30b26595605a59051bd3f9 |
| prototype/Utils.java | 42727019119dc578c6c3e05693ce7ca73f1364d086dfdcfbc300d1e5f6fdd438 |

逐个 float 运算使用 `Math.fround`：原版先算周长、线速度，再反算角速度，角度递减；不能直接改成 double 的 `360 / period` 并声称完全相同。位置先按未归一化角度计算，然后用 `(angle % 360 + 360) % 360` 的 float 顺序保存角度。弧度常数是 `(float)Math.PI / 180`。`convertToDays(seconds)` 为当前参考时钟的 `seconds / 10`。

`CircularOrbit` 对半径 <= 0 有归零角度分支；当前支持其中非负半径，0 半径绑定到焦点，负半径拒绝。PointDown/WithSpin 没有零半径分支，原版会产生非有限值，当前明确拒绝而不是伪造轨道。负周期允许反转；0 周期及 float 下溢/溢出的退化输入拒绝。

## 必须保留的区别与边界

1. **顺序是明确的 Web 策略，不是原版运行顺序复刻。** 原版 BaseLocation 分别按内部 CampaignEntity 和 LocationToken 集合推进，`updateAllOrbits()` 又以零时间循环四遍。这里用稳定 focus-first 拓扑遍历；不依赖对象插入顺序，不使用四遍近似。全部实体先推进，所有舰队随后看到同一个 endpoint 状态。
2. 原版会受到可见区域、快速推进、对象集合顺序影响；Web 固定60tick，不声称跨引擎整场景 bit-for-bit 同步。
3. `--native` 是从反编译来源转写的 **Java 单轨道公式 oracle**，3600组逐 tick 对照，不是实际启动原版游戏的端到端证明。JS/Java 三角函数在所有可能输入上的逐位一致未被证明。
4. spin 随机初相位/速度由未来世界生成器显式输入并保存；不将任意种子结果冒充原版生成结果。
5. 模拟事务仍最多512项实体变化，越界原子失败。未解决全星区规模调度/分区问题，不能因为一个星系能跑就声称完整星区可用。
6. 原版完整星系地图、行星着色、碰撞/地形、传感器、轨道舰队、市场 UI 尚不是本模块的成果；DevelopmentWorld 暂不假装变成原版开局。
7. 旧 rules lock 没有隐式迁移；新规则使用新开发存档，旧存档须显式迁移后再加载。

## 验证

`node scripts/check-campaign-orbits.mjs --native`：13项通过，包括3600组 Java公式对照；三类轨道、顺/逆方向、卫星跟随、批次一致、实时跳跃点/落点、provider替换、坏计划拒绝、SQLite重开/回滚、512项边界以及真实Worker→客户端投影。

生涯模式所有文件仍保持未提交。不得随正式发布混入。
