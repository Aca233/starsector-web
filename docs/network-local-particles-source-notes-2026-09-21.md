# Phase20 本地粒子事件：原版对照与实施边界（编码前）

- 原版0.98a证据：`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/EmitterFactory.java:263-276`，护甲黄色SmoothParticle，一秒生命、独立偏移/速度；`../decompiled/fs.common_obf/com/fs/graphics/particle/BaseParticle.java:30-70`，年龄、位置推进及亮度；`SmoothParticle.java:24-62`，尺寸、纹理和加法混合。与Web `ArmorImpactVisuals.ts` 交叉确认，不直接照搬反编译的局部类型。
- 现有Web普通SPARK为既有扩展，不宣称它新增了原版等价。保留其出生参数、随机消耗、逐固定步推进、密度策略、材质和绘制公式。
- 本轮先移动护甲火花(kind0)及普通火花(kind2)。房主只留事件、每成员剩余寿命及总占用量；不生成/更新位置、速度、尺寸、颜色曲线对象。消费者私有RNG按事件生成，并沿显示时间更新，单人原路径不变。每个事件在自包含窗口内携带出生步和参数，重复/跳帧/迟加入不以年龄0重播。
- 房主原随机游标严格保留；普通粒子密度计算必须加上虚拟占用。组数、粒子数、回放步数均限额，超额/自定义RNG或向量/不支持参数走旧生成路径；非60Hz更新使已有事件物化并回退。
- 不移动爆炸/碎片/EMP伤害/碰撞/弹药/战斗结算，尤其`CombatEngine.isBattleResultReady`仍依赖ship explosion生命周期。本轮不改CombatEngine、AI/fire-control并行WIP、生涯或网络信用/模拟频率。
- 格式是Web联机扩展，不是原版协议。LAN和Steam已有同build握手约束；新v1字段必须在完整帧、relay投影、接收端共同验证。无此字段的旧格式新客户端继续正常显示；旧客户端不得伪造相同build混入新包。
- 测试：真实FX/RNG对照、密度与寿命对照、客户端重建/乱序/断线/预算/失败回退、伤害与结算不变、共享LAN/Steam验证、无头WebGL画面对照以及同进程交替CPU/编码测量。只保留实测有净收益的实现；不把局部节省冒充整体Hz/ping改善。
- 原版实机UI/截图补验待许可；本轮不操作桌面，不启动子代理。无现成同场景原版截图时不得声称原版视觉验收通过。

## 实现中补充

- 事件版本1目前仅支持kind0/2；128组、2048粒子预算、64步冷回放上限，历史客户端不支持的新字段由现有同build握手隔离。`HostSnapshot.configureHostCosmetics`的旧测试/离线调用默认不启用；真实host.worker默认显式开启，因此不是留在未启用分支。`VITE_LAN_LOCAL_PARTICLES=false`单独回退，原`VITE_LAN_PARTICLE_RECIPES=false`也关闭事件迁移。
- 第一版字段对照暴露普通火花的RNG预留少计（9次draw/粒子，而非7/8）；已修正并用600步视觉RNG及字段一致性覆盖，失败记录保留。
- 第一版混合烟雾图像出现最大10/255通道差，不是修改了粒子字段，而是删掉虚拟火花后原始swap-remove重排的变化影响source-over烟雾。新增轻量slot顺序表，同时模拟虚拟/真实粒子的过期交换并在更新后还原真实粒子相对顺序；无事件时不额外扫描真实粒子。修正后6时刻图像逐像素相同，未放宽验收条件。
- 真正留在房主的是虚拟寿命/占用/顺序引用，不是位置速度等完整粒子。非原步长会按原统一顺序物化再继续旧更新，清空epoch使客户端不会重复绘制。
- 客机暂停/启动时可连续收到同一baseline reset；保留已生成的组而非每RAF重新生成。真实回退由年龄倒退触发重建。新增专门回归。
- 新增日志`hud.input.localParticles`（groups、particles、generated、advances、step）。隔离浏览器测试可以显式注入一次60火花的初始fixture，报告标记particleFixture；该注入只在测试Vite插件中，不进入游戏生产代码。
