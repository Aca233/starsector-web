# 桌面内加入 LAN 与断线修复（2026-09-19）

## 用户现象与边界

用户明确：LAN 显示300+ms；Steam进入对局即断线。LAN尚未确定是同路由器还是Radmin/n2n虚拟网，不能把数字直接归因于Steam中继，亦不能把隔离传输结果当成真实跨机RTT。

## 桌面入口修复

旧入口在检测到本机服务后只提供六位房间码，相当于只能连自己的空服务器；浏览器另一条路径会跳转房主网页，而Electron有意拒绝远程导航。现在桌面提供“邀请链接/房主地址 + 房间码 + 密码”，完整链接自动提取房间码，裸IP默认32110（网页服务通常3001，以链接为准）。

客户端资产、前端代码、localStorage和方案库继续来自自己的loopback origin。仅显式选择的房主 /lan/ws 协议经 server/desktop-lan-bridge.mjs 转发，保持二进制/文本透明，不打开远程页面。桥接只接受本机IP + 精确Host/Origin，限定HTTP(S)目标、不接受重定向/凭证/任意路径，最多4个会话，有界握手和发送队列。sandbox/contextIsolation/webSecurity保持开启，nodeIntegration保持关闭，未放宽CSP或增加通用IPC。

保存与刷新恢复使用远端桥接endpoint而不是自己的 /lan/ws；退出远端再创建房间会切回本机。Steam已选大厅但无页面占用时增加“在当前窗口继续进入”，不要求先leave毁掉大厅；不抢占其他活动页面。

## 已完成验证

生产构建 + 真正Electron隐藏测试窗口（独立profile与临时端口）+ 另一个真实LAN server：9项通过。覆盖邀请自动填码、独立玩家进入远端同一房间、窗口origin不变、localStorage保留、仅一个窗口、安全设置不变、真实传输中断后resume同一席位、刷新仍恢复远端、零renderer异常。窗口及服务均关闭。

桥接侧另有真实ws协议与安全验证，证据与关闭反例/修复复核见 artifacts/desktop-lan-join-20260919/。发现并修复了关闭握手未完成时pair过早移出集合的问题：现在两端CLOSED才释放名额，1秒terminate兜底，shutdown强制释放上下游。

本机测试不代表双机/虚拟LAN性能验收，不代表Steam原生SDK对局验收。双方须使用同一份完整新桌面包，不能只替换前端或单个后端文件。

## 相关传输修复

- 保留Worker补步间让出消息任务与心跳饥饿修复，60Hz目标及1/60步长不变，AI多Worker关闭。
- Steam guest可靠队列新增有界ACK窗口，合并尚未发送、同match/sync、无离散动作的连续移动输入；动作与控制消息保持FIFO，不丢开火/系统操作。解决隔离3秒断流后积攒输入补发撞160条/秒断线的反例。
- Steam快照使用现有有界pipeline；传输采样和断线原因写入desktop.log，方便区分原生SDK断链、状态确认超时与主机模拟过载。它不是消除物理RTT的承诺。

具体网路验收结果见 artifacts/steam-transport-latency/HANDOFF.md。真实两机进战斗、持续对战、切后台和短断网恢复尚待双方新版实测。

## 本地交付

0.2.2测试包（未发布GitHub、未更新已安装程序）：artifacts/electron/0.2.2-20260918181410770/Starsector-Web-0.2.2-lan-fix.zip。构建ID 2026-09-18T18:02:32.019Z。真实打包exe另跑同样9项UI检查全部通过；打包后端5个变动模块与review源码逐字一致，ZIP包含exe与新增桥接/可靠队列模块。桥接23组真实WS/生命周期检查通过，Steam虚拟可靠链路1438断言通过，心跳146断言通过。类型检查、lint、构建、打包通过，保留原大chunk/默认图标提示。

Steam开战即断仍未在原生双机环境复现，不能宣称用户报告的根因已解决。合法16MiB首帧编解码及513片重组隔离验证通过；慢于8秒的持续分片仍可能超时，未放宽该防护。需新版双方开战前后desktop.log的 [steam-transport] 记录与准确UI提示区分真正断链原因。已有3005/3007与用户现有游戏进程未替换/终止。

## 0.2.3 本地桌面整合包

- Build: 2026-09-18T18:43:23.020Z
- 目录: C:\Program Files (x86)\Starsector\starsector-web\artifacts\electron\0.2.3-20260918184803427
- 完整ZIP: Starsector-Web-0.2.3-network-test.zip
- 已有桌面LAN入口、Steam窗口/可靠输入ACK和新增LAN压缩/投影编码在同一包中。包内10个相关后台模块与验收时源码逐字节一致；不是只复制了exe。
- 实际打包EXE经本机非loopback网卡到另一服务入房：13项检查通过，包括两端压缩协商、自动填码、本机origin/存储不变、无外部浏览器、沙箱隔离、断线恢复、刷新恢复、版本/build日志和帮助入口，无renderer异常；测试桌面和临时relay均关闭。证据见 artifacts/desktop-network-023-20260919/packaged-electron-ui-result.json。
- 没有替换已安装游戏、重启用户服务或发布GitHub；双方需使用这一完整包进行物理LAN/Steam复测。Steam一进对局断线仍待真实双账号日志确认，不能宣称已修复。
