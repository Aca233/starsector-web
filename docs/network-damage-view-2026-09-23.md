# 伤痕展示快照精简（2026-09-23）

## 实施前证据与边界
原版0.98a：重新核实 ../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/String.java:159–188 的模板/alpha遮罩、OOoO.java:160–168 整数热光通道、void.java:31–58 闪光计时衰减。当前 Web src/engine/render/ShipDamageVisuals.ts 只读8个呈现/身份字段，ShipDamageState 在权威端计算最终 opacity/intensity。

保留原版纹理、色彩与随机动画算法，native authority 展示快照仅对严格默认14字段普通伤痕记录省略 heat/justHit/flash/flashElapsed/phase/pulsePeriod。保留 cellIndex/localPos/opacity/intensity/size/rotationRad/kind/variant。未知记录/自定义数组、普通generic捕获、component模式继续完整同步。不是可恢复模拟检查点，不改变AI/物理/刷新频率。

用户接受可验证的小幅提升，不再要求每组5%。基线包含已保留的 guest direct restore 与 AI 优化。现有完整P1独立oracle、1200tick战斗、冷加入/跳帧/回退和48个实际贴图Canvas像素样例集中核对。性能使用22船3/5顺序副本 A/B+B/A，当前编解码/还原保持相同，分别报告CPU、全帧及压缩delta字节。原版实机与全WebGL/WAN延迟仍待核实；不操作桌面、不提交发布、不触及生涯。

## 已接入且保留的结果

默认启用入口为 HostSnapshot.captureAuthorityCombat，通用 captureCombat/captureHostCombat 默认不变。VITE_LAN_DAMAGE_MARK_VIEW=false 可在构建时回退（专用服务器构建同样转发此开关）。生成器添加严格8字段原生还原布局；此前 guest direct restore / AI 优化全部保留。

### 集中验证
- TypeScript、改动文件 oxlint、生成器 --check 通过。
- 8项既有契约：首轮7项通过，新增入口测试误把既有 particleEvents 附带数据算作不一致；补正期望后仅定向重跑该项通过，未改生产代码。包括22船1200tick完整独立P1对照、RNG和权威所有权、冷加入/跳帧/倒退、generic/getter/Proxy、陌生布局/自定义数组与component模式回退。
- 48组实际原版伤痕资源的Canvas像素对照通过，24组非空，像素差为0；不是完整WebGL或原版实机验收。Playwright使用已有运行时依赖，无依赖安装和桌面操作。

### 全链路A/B（当前源，非旧phase44数字）

22船、120测量帧/30预热帧、3/5顺序接收副本。包括capture、encode、实际有序delta、deflate6、inflate、所有副本decode/apply；物理在计时外。同一权威轨迹，4组hash一致，独立oracle仅允许省略6个具名内部字段。

| 顺序副本 / 顺序 | 全链路P50 ms | 减少 | P95比率 |
|---|---|---|---|
| 3 / A→B | 24.1542 → 22.2970 | 7.69% | 0.9344 |
| 3 / B→A | 24.9212 → 23.6052 | 5.28% | 0.9401 |
| 5 / A→B | 35.6983 → 34.5089 | 3.33% | 0.9530 |
| 5 / B→A | 36.2051 → 35.0405 | 3.22% | 0.9930 |

全部组完整未压缩帧减少6.08%，delta包减少19.89%，压缩后的delta字节减少16.36%。只宣称总链路收益：5副本时apply阶段单独增加1.9%/4.0%，并不是所有阶段都更快。不能与前一轮节约比例相加，也不能换算为WAN RTT/FPS/主客机Hz提升。

### 真实房间接通核对（未证明Hz提升）
当前源码构建authority，48船、1房间、2个隔离原生接收Worker、8.014秒、无secondary motion socket。协议收发和原生apply跑通；physics 55.90Hz，full-state apply 32.69Hz。出现1次主机过载恢复；并非无恢复的性能通过。host.worker recover 可能由>250ms积压或>1000ms回调间隔触发，此次旧harness仅统计次数，缺少原因细分，不能断言具体触发条件。接下来针对这个真实过载点补诊断，绝不把单次房间数据当配对改善。

证据：artifacts/damage-mark-view-20260923/{benchmark/result.json,pixels/result.json,room.json,retained-source.json}，其中retained-source保留源码hash和文本。没有提交、推送、发布或生涯改动。

## 后续只读审查与过载取样
独立子代理核对当前生产客机不调用 ShipDamageState.advance，被删字段不被绘制/预测读取，record解析不固定14字段；恢复是重放输入，不从CombatSnapshot接管权威。实验 ShipDisplayLane 校验仍依赖14字段，尚未接入生产，未来迁移必须显式适配。

为追查真实房间那次过载，在既有 benchmark-server-rooms 中保留 recovered.pauseMs/diagnostics；CPU采样只注入artifact wrapper，不进入生产。后续8秒诊断运行未复现恢复（0次，physics59.86Hz，apply约37.7Hz），不把不同负载的两次结果当成性能A/B。采样6.145秒的最大自耗时热点为 packFresh 8.17%、assessThreats 3.19%、encodeArray 3.14%、solveWeaponAim 2.69%；反复系统列表分配及isPhased查询合计值得后续验证，但尚未以猜测修改模拟语义。证据为 authority.cpuprofile、profile-hotspots.json、room-profile.json。
