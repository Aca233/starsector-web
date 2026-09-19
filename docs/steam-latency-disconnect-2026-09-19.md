# Steam 高延迟／断线：隔离测试包（2026-09-19）

## 给双人复测使用

- 文件：`C:\Program Files (x86)\Starsector\starsector-web\artifacts\Steam-Network-Fix-20260919.zip`（约 323 MiB）。
- **两个人都使用这一个 ZIP**，退出旧游戏，解压到新文件夹后运行 `Starsector Web.exe`。必须保持各自 Steam 客户端登录；房主重新建房，不混用旧包。
- 界面版本仍为 0.2.1；本地测试构建 ID 为 `2026-09-18T18:04:02.181Z`（北京时间 9 月 19 日 02:04）。没有发布 GitHub 更新，没有替换旧程序或主工作区的 latest-build.json。
- 再次断开时，保留双方断线附近的 desktop.log。此电脑默认位置为 `C:\Users\Aca\AppData\Roaming\Starsector Web\desktop.log`；其他电脑以其用户资料目录为准。

## 内容与范围

从已发布的 v0.2.1 / f3e67765986a491db501a92deb0d433e14097bab 隔离构建。加入 Steam 状态 4 帧／64 KiB 有界流水窗口、每帧独立 ACK、前端未发送心跳不误报失联、Worker 补步间任务让出、限频连接诊断日志。仍保留真正静默／ACK 超时／主机过载保护。

主工作区有其他任务并发修改。其桌面 LAN 入口、舰船多系统及客机可靠输入队列均留在主工作区，没有混进这个已验证的隔离包。

## 本轮验证

- 11 项 Steam transport／overlay 回归通过。
- 真实 LanConnection 的隔离心跳测试：17 场景、146 断言通过；打包前端与被测 protocol.ts SHA256 一致。
- 隔离源码构建、TypeScript、lint 通过；保留既有 Vite 大 chunk 提醒。
- 源码构建和打包后资源各做一轮真实浏览器／WebSocket／Worker 游戏流程。Steam SDK 数据通道是模拟的：200ms 目标 RTT、每方向 128000 bytes/s、一次 1500ms 可靠通道停顿。停顿中没有断开，随后有新帧；刷新重连、恢复控制、移动、结束返回房间通过，页面错误 0。
- Electron 新包启动到 Steam 页面，sandbox/contextIsolation/webSecurity 保留；但本轮电脑上 Steam 未运行，真实 SDK 检查返回 `Cannot create IPC pipe to Steam client process`，旧 smoke 脚本在其“SDK 应就绪”的断言处失败。**本轮未通过真实 Steam SDK／两账号跨网验证，不把上述流程模拟当作实网通过。**
- ZIP 3733 个条目，关键 EXE／DLL／原生模块／后端／build 标识存在；后端关键文件与被测隔离源码逐字一致。

具体报告：`C:\Program Files (x86)\Starsector\starsector-web\artifacts\steam-network-fix-build.json`。

此修复去除了可复现的 RTT 单帧瓶颈和心跳误判条件，不能据此认定用户原断线的唯一原因，更不能承诺所有 Steam 网络都稳定。可靠 P2P 的重传队头阻塞仍存在。
