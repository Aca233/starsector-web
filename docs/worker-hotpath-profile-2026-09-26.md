# Worker 热点再定位（2026-09-26）

当前接受版本：相位即时读取、HUD 单次投影、Decoder 有序 Set 工作队列。200舰、150预热、60采样tick，真实生产Host；315模块冻结，采样前无源漂移。无头后台采样不操作桌面。

60tick累积CPU栈分类：simulation 2233.399ms；display-graph 782.786ms；display-projection-and-packed-visuals 339.113ms；未归属GC 120.056ms；测试权威审计46.492ms；other29.757ms。idle5478.303ms含交替两臂/主线程审计等待，不能当作可利用的游戏算力。

主要调用：captureGraph self363.027/inclusive782.786ms；火控update100.929/920.325ms；preAim54.446/347.764ms；aim108.431/274.021ms；读域guard124.904ms；outsideAcquisition91.451ms；planFleetTactics69.473/343.870ms；PackedVisual record86.549/205.182ms；RenderWeaponDictionary.project85.062ms；isPhased70.610ms；combatProfile67.336/87.166ms。inclusive互有嵌套，不可相加。

碰撞resolveShipToShipCollision30.035/96.580ms，当前不是首要瓶颈。接下来量化显示行的字段冗余，而不是复活负收益缓存。

210次witness比较、211次完整显示图、4653851节点对照通过。CPU采样有扰动，不能与此前不同采样直接算提速。原始profile、汇总、冻结源图与当时工具哈希见 artifacts/worker-hotpath-profile-20260926。

最终检查发现另一任务更新6个模块（含舰装、显示投影和火控）；均未覆盖。冻结诊断图仍精确一致。后续性能候选需用最新工作区重新冻结两臂，不能用旧图掩盖并发差异。详见 final-verification.json。
