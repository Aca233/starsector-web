# 移动模块导航索引：预登记（2026-09-27）

## 来源与有界问题
本机原版0.98a-RC8 WeaponAPI/CombatEntityAPI 的位置/速度/碰撞域是实时状态；本轮不改碰撞规则或Web既有tacticalPolicy。现行TacticalNavigation.obstacles每个模块AI重复全名单扫描；旧根舰索引只允许静止AI阶段，位置变化直接close，不能原样延长到ship.update。原版实机/界面未验，此为引擎内部候选筛选，没有UI改动。
已有同冻结740模块profile：导航obstacles占模拟inclusive约7.92%；roster/assembly getter子树并集5.23%，Gloriana舰载机preAim+aim仅1.17%，不先做这些理论上限偏低的小改。上一v2实际浏览器早期HUD显示发送preflightSkips/skipped为0，后期simulation均值33.263ms/lastStep36.04ms，tick32之后停止；没有稳态延迟证据。

## 新方案（不是重试旧根舰索引）
只在已有Worker-owned interleaved threat写域中以新VITE_AI_INTERLEAVED_NAVIGATION显式开关创建导航索引，缺省关闭。根舰AI不启用。沿用原parent/sourceCarrier依赖组，在每次AI和ship.update之后通知几何变化；未知writer/异常/退出沿用整个域close。
- 初次导航查询建立排序锚点；以后移动不重新排序，也不把旧坐标当实时坐标。每次失效扩大最大坐标位移、半径与L1速度上界；查询范围加上位移界。只能多选不能漏选；最终仍用现有精确公式、原候选顺序和实时状态。
- 每个TacticalWorld使用私有WeakMap绑定，只绑定现有写域证书与观察舰；真实名单须为原名单同序子集，避免将退场舰带回。未知新成员/重排/非有限坐标关闭或回退。记录器、未知观察运动函数/数学、普通公开world维持原路径。
- 没有跨帧缓存、没有延长火控/弹体许可，没有改变Hz、实体数、精度、画质、权威/接收校验或过载保护。

## 写集及验证
四生产文件已before备份：InterleavedNavigationIndex.ts（新增）、WeaponThreatEnvelope.ts、TacticalNavigation.ts、CombatEngine.ts。集中一次typecheck/改动lint；原导航场景的精确obstacles/avoidCollisions/forwardPathClear差分，移动/增长/退场/坏数/未知回调/关闭/异常，真实init/default与60步扰动authority+全部RNG/autofire trackers逐步比较。具体失败才定向修复。
正确性通过后唯一独立隐藏Node A0/B1/B2/A3；176实体734挂点、seed917、三舰循环、2玩家+20AI、3200DP，四既有模拟实验双方同开（display-v2本候选不混入），150热身+120完整fixedUpdate。两组均值各至少省5%，20/270步状态hash匹配既定基线才保留。未达门槛完整写集SHA预检/归档/精确撤回，不择优复测，不事后降低门槛。只有离线通过才追加一次当前双客户端无头浏览器功能验收；不将离线结果当实际Hz/P95改善。
