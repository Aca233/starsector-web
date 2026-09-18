# Electron 桌面版

Electron 版在独立窗口内运行现有舰船设计与战斗沙盒，不再要求打开外部浏览器。Windows x64 构建包含 Chromium、Node 运行环境、游戏资源以及 LAN / Steam 后台。原有浏览器启动器和便携版仍保留。

## 使用与数据

- 默认以**单机模式**进入主菜单，只监听本机。点击主菜单的局域网 / Steam 入口或原生“游戏”菜单后，自动在后台准备对应服务并进入页面，不需要手动切换模式或确认启动。服务已就绪时直接进入，不重复重启；只有页面确实报告未保存编辑时才保留离开保护。不同联机入口之间仍会停止原有后台、结束其房间，不会同时托管 LAN 与 Steam 对局。
- 局域网模式才监听所有网卡。朋友可在可信局域网通过“游戏 → 连接地址”中的 IP 访问；桌面版玩家可以继续使用 Steam 房间。不会自动改防火墙或配置公网穿透。
- 当前桌面 LAN 入口用于本机房主 / 管理本机房间；加入另一位房主的 LAN 服务仍需在外部浏览器打开其 IP 链接。此版本没有放开桌面窗口加载任意远程网页；全桌面跨机加入可使用 Steam 入口。
- Steam 仍使用现有 `steamworks.js` 接口；默认 AppID 480 仅限开发联调。必须先运行并登录 Steam；未承诺 Steam 覆盖层或未经验证的双机中继效果。SDK 位于独立后台进程，初始化超时不会把整个桌面窗口卡死。
- F11 切换全屏；原生菜单提供复制粘贴、重新加载、连接地址与更新。关闭窗口会询问是否退出，并停止本应用拥有的后台，不关闭其他软件。
- 正式版数据保存在 `%APPDATA%\Starsector Web`；开发版使用 `%APPDATA%\Starsector Web Development`。窗口尺寸、模式与 Chromium 存储均保留。安装器默认卸载也不主动删除这些数据。
- 固定本机地址 `http://127.0.0.1:32110`，不同模式使用同一 origin，避免切换导致方案库变更。端口冲突会明确报错，不抢占服务或悄悄换端口。
- 桌面版不自动读取外部 Edge / Chrome 的浏览器资料。原浏览器方案请通过游戏现有 JSON 导出 / 导入迁移。实时战斗与未保存编辑不会跨重启恢复。

## 开发启动

```powershell
npm ci
npm run desktop
```

已有前端构建时使用 `npm run desktop:start`。桌面开发当前加载 `dist`，不是 Vite HMR；修改前端后需重新构建。可传入：

```powershell
npm run desktop:start -- --mode=lan --no-update
npm run desktop:start -- --mode=steam --steam-app-id=480
```

辅助参数：`--port=32110` 指定端口（更换 origin 会使用另一份浏览器存储）；`--profile=绝对目录` 用于隔离开发资料；`--hidden` 用于无人值守的隐藏窗口验证。普通用户无需使用命令行。

## 打包

在 Windows x64 / Node 22.12+ 上：

```powershell
npm run package:electron
# 只做解压目录，便于本地检查
npm run package:electron -- --dir --skip-build
# 从标签指定正式版本，不修改本机 package.json
npm run package:electron -- --version 0.2.0
```

输出为 `artifacts/electron/<版本-时间戳>/`：

- `Starsector-Web-Desktop-Setup-<版本>-x64.exe`：按用户安装的 NSIS 安装器，不默认请求提权。
- `Starsector-Web-Desktop-<版本>-x64.zip`：完整解压后运行 `Starsector Web.exe`，不需要另装 Node。
- `win-unpacked/`：可直接运行的打包目录。
- `latest.yml` 与安装包 `.blockmap`：Electron 安装版更新元数据。

每次构建使用新的输出目录，不删除或覆盖以前的包。后台文件按解析后的依赖图收集，Steam Windows x64 原生库单独包含；不会打包原版安装目录、Git、开发资料、存档、浏览器用户目录或历史 artifacts。

当前没有配置 Windows 代码签名证书，安装器和可执行文件是未签名构建，系统可能显示来源提示。应核实来源，不要关闭系统安全防护。Electron 的默认图标暂未替换。

## 自动更新

Electron **安装版**使用 `electron-updater` 的 GitHub Releases + NSIS 更新流程，校验 `latest.yml` 中的 SHA-512；不调用旧便携包更新器、不覆盖 `.updates` 目录。

启动后后台检查 / 下载新稳定版本。完成后“更新”菜单显示“重启并安装”；只有用户确认，才停止服务并启动安装器。不会在战斗中自动重启，也不会在普通退出时偷偷安装。断网或更新失败不妨碍继续使用当前版本。

开发版和免安装 ZIP 不执行 NSIS 自动安装；菜单可打开 Releases 手动获取新包。不能把 ZIP 直接当成已安装的 NSIS 程序自动升级。用户资料位于独立的 AppData 目录，不在程序文件内。

发布沿用 `.github/workflows/windows-release.yml`：稳定标签 `v0.2.0` 触发三类构建（浏览器 LAN ZIP、浏览器 Steam ZIP、Electron 安装器/ZIP）。所有附件先上传到草稿 Release，再一起公开。Electron 用 `latest.yml`，旧便携版用 `windows-updates.json`，二者不混用。公开仓库普通代码推送不会单独触发更新。

未签名发行只依赖 HTTPS 和 Release 账号 / 更新摘要的可信度，不等同于独立代码签名。正式对外发行应另行配置代码签名与资源授权。

## 安全与生命周期

- `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`，没有 renderer 可调用的通用 Node / 文件系统 / shell 桥。
- 游戏窗口只允许固定本机 origin 的游戏页面；拒绝弹窗、webview 和远程页面导航。摄像头、麦克风、定位、设备等权限默认拒绝，只保留游戏所需的受限全屏 / 剪贴板写入 / 指针锁能力。
- 为本机页面添加 CSP，保留服务原有 COOP/COEP 与 WebGL2 / Worker 能力，不通过关闭 Chromium 安全机制来兼容游戏。
- LAN / Steam 服务在本应用拥有的 `utilityProcess` 中运行。退出和切换先请求清理房间、连接和 HTTP 服务，超时只终止这个自有子进程。
- 窗口保持游戏的后台时钟策略；最小化不被额外的 Electron 页面节流中断，但不是游戏性能或 Steam 网络质量保证。
