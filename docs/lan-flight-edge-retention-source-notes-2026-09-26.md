# 临时坐标不可读时保留飞行按键（2026-09-26）

## 修改前证据

交叉对照中两次 shared 各有一个 DOM KeyS 未进入发送和绘制：之后多个活动帧保持 keys=0，非仅绘制响应变慢。尚不能凭该记录证明当时一定是 seqlock 竞争；应通过定向强制坐标不可读复现源码中同类故障。LanBattle.down 的 active() 要求 readRealtime() 本次成功，失败会在 heldFlightKeys.add 之前退出。readRealtime 是有界共享读，允许在合法代际和操控权限仍有效时短暂返回null。

原版先行：只读本机0.98a的 ShipCommand.java:4–10，ACCELERATE/ACCELERATE_BACKWARDS/DECELERATE/横移转向为飞行控制；CombatEntityAPI.java:8–13 定义运动状态。保留原键位和按下/松开行为；本轮修改的是Web联机输入保留而不是原版玩法。没有原版实机UI验收，不能声称原版等价。

## 预期与最小修复

仅无离散命令冲突的飞行键可以在 hasControlPermission 且呈现视图仍存在时保留 held 状态，不把一次读失败误当权限撤销。动作、指针和射击仍走原 active 检查；发网仍必须 readInput 得到新鲜坐标、通过连接/预算准入，不能虚构 aim、消耗序号或跳过ACK。失焦/文本输入/屏蔽/断连/stop/reset照旧清空，坐标不可读期间松开也必须撤回待发 held 状态。

## 定向验收

冻结 before 与 after；既有真实双端无头 LAN 场景，各10秒并保留800ms主机停顿、真实重连、共享控制原子/撤销/释放检查。计时之后临时让实际客户端 readRealtime 返回null：旧版应复现按下被忽略，新版必须保留按下且150ms不消耗输入序号；恢复后必须出现对应发送、权威累计ACK及实际draw。再检查不可读期间松开不会复活，文本输入焦点禁止接受飞行键。故障注入只在测试，无生产测试钩子。集中一次typecheck、改动lint和相关场景，不重跑四臂性能。正确性修复不宣称新的提速百分比，默认开关不变。
