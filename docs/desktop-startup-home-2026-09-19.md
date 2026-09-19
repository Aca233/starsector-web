# EXE 默认主菜单修复（2026-09-19）

## 原因与修复

Electron 启动时使用 `options.mode ?? settings.mode`，普通双击会恢复上次 LAN/Steam 模式，并据此生成直达 URL。本机安装版 0.2.1 的 `desktop-settings.json` 保存的是 `mode=lan`，因此浏览器根地址正确也不会修复 EXE 的入口。

`desktop/main.mjs` 改为 `options.mode ?? 'local'`。普通双击始终先以 loopback 单机后台进入主菜单；不删除设置或 Chromium 存储。显式 `--mode=lan` / `--mode=steam` 与 Steam 内部重启参数保持原行为，Steam 浮层准备时的跳转代码未改动。

## 本机安装版

- 实际程序：`C:\Users\Aca\AppData\Local\Programs\Starsector Web\Starsector Web.exe`，版本仍为 0.2.1。
- 对其 `resources/app.asar` 中的 `desktop/main.mjs` 做同一个最小修复；不是仅改源码或浏览器链接。归档在工作区重新生成并核对入口列表、原 unpacked 标记后原子替换。EXE、backend、原生模块与 AppData 未替换。
- 原归档备份及记录见 `artifacts/exe-startup-home-latest.json` 指向的目录。未关闭任何用户游戏进程，替换前确认安装版未运行。
- 不调整 Electron 安全 fuse、CSP 或网络权限；未修改发布版本号、未上传新安装包。其他电脑/旧发行包仍需要包含该源码修复的新版本，本机补丁不等于已发布更新。

## 验证

- JavaScript 语法与 lint 通过。
- 使用该实际安装版 EXE、独立临时 profile、`--hidden --no-update` 和临时端口 53641；不使用用户真实方案库，不触发自动更新或可见窗口。
- 临时 profile 上次模式为 LAN：无显式模式参数启动，URL 为 `/`，显示主菜单；从菜单点 LAN 后正常进入 `/?view=lan` 与创建房间入口。
- 临时 profile 上次模式为 Steam，并带旧 Steam 入口：普通启动仍为 `/`，不跳回旧联机页。窗口位置及 1000×720 尺寸保留。
- 两次均无 renderer pageerror；验证 EXE 与自身后台已关闭，原 3005 服务未改动。未进行真实 Steam 两机浮层/邀请验收。
