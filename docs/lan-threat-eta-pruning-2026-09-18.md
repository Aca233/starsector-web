# 联机房主：威胁 ETA 下界排除（2026-09-18）

## 判定

已保留 ThreatAssessment.ts 的原生查询优化，但**大规模联机仍未达标**，不能把纯计算收益当作联机修复。3005（PID 18988）与原 dist 没有替换或重启。

## 变更

原 ETA 为 max(recovery, readiness, turnTime, approachTime) + travel。在既有 approachTime 排除之后，原生 WeaponThreatEnvelope 路径先计算不含 turnTime 的下界；严格大于 horizon 才跳过昂贵射界/转向计算。等号、NaN 等不确定比较保持原计算。未提供 envelope 或有未知回调时保留原读取顺序。没有跨帧缓存、AI 降频、修改物理 dt、舰数/特效/伤害或放宽恢复保护。

原生威胁阶段门槛是 ais.length >= 4；8 舰确实可以启用，不是 20。此前错误口述已更正。契约是原生只读 AI 查询，不承诺任意全局原型/访问器恶意改写仍等价。

## 验证

- 5,764 项边界/回调检查通过：5760 个真实样本组合与 4 种回退读取顺序检查；新排除命中 1157 次。覆盖负/零/NaN/Infinity horizon、ETA 等号及上下 1e-10、冷却/充能/连射/速度/射程变化。
- 8/32/100 舰分别 1200 步，每 30 步交替双世界；完整表现捕获投影及 RNG 一致，并与独立旧世界轨迹一致。
- 剔除前 120 步后，32 舰原 6.33556 → 新 6.25593 ms/步（约 1.26%，小幅）；100 舰 19.13435 → 18.42500（约 3.71%）；8 舰 1.67352 → 1.68537（约慢 0.7%，不宣称加速）。
- 32 舰 1800 步带 profiler 采样：前 600 步 7.480ms，随后两段 10.829/10.431ms。开场短测不足以覆盖接战负荷；带 profiler 数据不能直接和普通基准比较。
- typecheck、lint、隔离生产构建通过；构建 ID 2026-09-18T07:41:58.606Z。当前源码比构建冻结版本仅两行解释性注释更正，执行代码相同。

## 真实双端（不是仅纯计算）

1. 首次复测 8/32/100 舰均过载。8 舰约 14.966 秒结束，观测到长调度停顿，不能隐去该失败。机器有多个并发 Node 计算进程，但不足以将失败完全归因于它们；未停止其他任务。
2. 相邻旧/新 8 舰复核均通过约 20 秒性能窗口及双方 W 按下/释放权威输入验证。旧 0.99783×，新 0.99854×；无恢复或页面/Worker 错误。新版最终 tick1786、双方 loaded。这不保证任意环境都不卡。
3. 最新 32 舰计划 65 秒，实际 15.270 秒第三次过载终止；0.91792×，服务端 tick841 / Worker847，两次恢复，89 张快照，双方曾 loaded。
4. 最新 100 舰 2.054 秒终止，服务端 tick43 / Worker55，两次恢复，4 张快照，双方尚未完成 loaded。不能宣称百舰成功进入可操控战斗。

## 未采用实验

- phase 内视野半径缓存：局部调用省约 44%，整步约 0.9%；回调保护未补齐，未写正式源码。
- 将 readiness 排除移到距离边界前：额外排除为零，只增加读取，已移除。顺序基准存在明显机器负载漂移，不引用该轮大降幅。

## 证据（忽略的 artifacts）

lan-current-late-battle.{cpuprofile,json}、lan-current-late-battle-hotspots.json；lan-threat-timing-paired.json、lan-threat-timing-paired-8.json、lan-threat-timing-boundaries.json；lan-threat-timing-live-final.json、lan-threat-timing-small-room-control.json、lan-threat-timing-live-recheck.json；lan-sensor-baseline-sources.json、lan-threat-timing-candidate-sources.json。

未新增项目测试文件/运行器，未做素材 hash/size 人工审计。隔离诊断服务和浏览器均已结束。下一步应减少更大计算/同步成本，不将微优化当终点。
