# Electron 桌面版

Electron 版在独立窗口内运行现有舰船设计与战斗沙盒，不再要求打开外部浏览器。Windows x64 构建包含 Chromium、Node 运行环境、游戏资源以及 LAN / Steam 后台。原有浏览器启动器和便携版仍保留。

## 使用与数据

- 普通双击 EXE 始终以**单机模式**进入主菜单，只监听本机，不恢复上次的局域网 / Steam 启动模式。显式 `--mode=lan` / `--mode=steam` 参数仍可直达指定入口，也保留 Steam 浮层初始化的内部重启跳转。点击主菜单的局域网 / Steam 入口或原生“游戏”菜单后，自动在后台准备对应服务并进入页面，不需要手动切换模式。首次从非 Steam 启动进入 Steam 模式时，会在通过未保存编辑保护后自动重启一次，以便在图形设备创建前初始化浮层；已按 Steam 模式启动时直接进入，不重复重启；只有页面确实报告未保存编辑时才保留离开保护。不同联机入口之间仍会停止原有后台、结束其房间，不会同时托管 LAN 与 Steam 对局。
- 局域网模式才监听所有网卡。朋友可在可信局域网通过“游戏 → 连接地址”中的 IP 访问；桌面版玩家可以继续使用 Steam 房间。不会自动改防火墙或配置公网穿透。
- 桌面 LAN 入口支持直接加入另一位房主：在「加入房间」粘贴邀请链接，房间码自动填入；也可填写 IP:端口 + 六位房间码。裸 IP 默认 32110（桌面后台），网页启动器通常为 3001，以邀请链接为准。画面、资产、配装库仍在本机，不打开远程网页。只有用户指定房主的 `/lan/ws` 游戏协议经过 loopback-only 后台桥接；保留原 sandbox/CSP，不新增通用 IPC、不放开远程页面执行。刷新客机沿用该房主的连接与恢复令牌，不会错误连接自己的空服务器。双方必须使用相同构建。
- Steam 仍使用现有 `steamworks.js` 接口；默认 AppID 480 仅限开发联调。必须先运行并登录 Steam。大厅与 P2P SDK 仍位于独立后台进程；窗口主进程额外初始化 Steam SDK，专用于浮层、邀请与邀请回调，因此浮层的原生故障不属于后台隔离范围。真实双机中继仍需单独验收。
- F11 切换全屏；原生菜单提供复制粘贴、重新加载、连接地址与更新。关闭窗口会询问是否退出，并停止本应用拥有的后台，不关闭其他软件。
- 正式版数据保存在 `%APPDATA%\Starsector Web`；开发版使用 `%APPDATA%\Starsector Web Development`。窗口尺寸与 Chromium 存储均保留；记录的上次模式不再决定普通启动页面。安装器默认卸载也不主动删除这些数据。
- 固定本机地址 `http://127.0.0.1:32110`，不同模式使用同一 origin，避免切换导致方案库变更。端口冲突会明确报错，不抢占服务或悄悄换端口。
- 桌面版不自动读取外部 Edge / Chrome 的浏览器资料。原浏览器方案请通过游戏现有 JSON 导出 / 导入迁移。实时战斗与未保存编辑不会跨重启恢复。

## Steam 好友邀请

1. 先登录 Steam，再启动桌面版进入 Steam 联机并创建/加入房间。
2. 房间 → 邀请朋友 → **打开 Steam 好友邀请**。按钮由窗口进程中的 ISteamUtils::IsOverlayEnabled 实际检测控制；不可用时显示原因，不伪报成功。
3. 请求经带 Origin 校验的本机接口和受控 IPC 转交窗口主进程，主进程检查登录身份后调用邀请接口；不再对无窗口的后台调用浮层。
4. Steam 设置 → 游戏中需启用浮层；直接启动仍不可用时，可将此桌面程序添加为 Steam 库中的非 Steam 游戏，并从 Steam 启动（启动选项可填 --mode=steam）。默认 AppID 480 是共享开发身份，**不会**自动调用 RestartAppIfNecessary 去启动 Spacewar，也不会修改 Steam 客户端配置。
5. 朋友须提前打开同版本游戏的 Steam 入口。邀请回调只预填完整房间号，仍由朋友确认加入，不强制退出已有对局；密码另发。AppID 480 不代表未运行本应用时 Steam 能正确拉起它。
6. 普通浏览器不支持 Steam 浮层；不显示无效的打开按钮，仍可复制房间号通过聊天发送。已禁用或未注入的桌面浮层也保留此后备方式。

安全设置仍为 sandbox / contextIsolation / webSecurity 开启，nodeIntegration 关闭；没有 renderer 通用 IPC 或原生 API。Steam 模式在创建窗口前启用 SDK 推荐的 in-process-gpu / disable-direct-composition，并维持静态菜单重绘；单机/LAN 启动不启用这些开关。

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

## Steam 邀请接入验证（2026-09-18）

- npm run steam:check：5 组离线回归，覆盖初始化次序、64 位大厅号、身份校验、不可用状态、邀请回调、IPC 关联/超时/关闭、HTTP 同源与浏览器拒绝路径。
- TypeScript、lint、生产构建通过；Vite 仍有既有大分块提示。新增 Koffi Windows x64 原生文件与许可证随桌面包分发。
- 独立 Edge 页面验证：浏览器隐藏无效按钮、桌面不可用时禁用并解释、状态恢复启用、请求成功/失败反馈，无 pageerror。
- 实际 Electron + utilityProcess + Steam SDK 验证：临时测试大厅 → HTTP 邀请 → 窗口执行器 IPC（以桩代替发送）→ 回填邀请 → 离开大厅通过，**没有向任何好友发送测试邀请**。
- 桌面单机/LAN、WebGL2/SAB、沙箱、导航限制、退出释放端口、方案库跨重启保留通过；Steam 初始化重启的 profile、port、入口片段与存储保留通过。
- 开发版与已打包 exe 均能加载窗口 SDK 和 IsOverlayEnabled 检测。当前本机隐藏窗口测试的 Steam 返回 available=false，界面正确报告未就绪/禁用，**不把这当作浮层实际弹出或双账号邀请已验收**。真实 Steam 注入窗口与好友接受仍需交互验证。

## 更新下载可靠性修复（2026-09-19，待下次打包生效）

- 增量下载前，读取当前版本 GitHub Release 的 `latest.yml`，以完整 SHA-512 和大小核对缓存的 `installer.exe`。匹配后重新取得对应版本的 blockmap，替换可能过期的缓存；不会仅凭相同版本号把本地重构建包当成 GitHub 原始包。
- 缺少缓存、本地同版本重构建、旧发行元数据不可用，或增量合成校验失败时，明确告知退回整包下载的原因。完整下载成功后重新保存目标版本索引，避免旧索引继续污染下一次更新。
- 整包先用 256 KiB 范围请求确认支持，再以最多四路、每段 8 MiB 下载。每段检查 HTTP 206、Content-Range 和实际长度，传输中断最多尝试三次，连续 30 秒无数据终止该尝试；已完成分段仅在本次下载中保留，不声称跨重启断点续传。
- 服务器不支持范围请求时退回原下载器。各段成功后仍需校验完整 SHA-512，之后继续执行 electron-updater 原有的签名验证（若配置签名）和安装流程；任何损坏文件都不能进入“可安装”状态。不使用第三方下载镜像，不降低 TLS、签名或摘要检查。
- 更新菜单显示增量/整包、百分比、速度、剩余时间、已下载/总大小和回退原因；每十秒写入一次进度日志。下载期间重复点击“检查更新”只显示当前状态，不重新检查或重置进度；失败有明确重试入口，不自动安装或退出对局。

本改动尚未发布到 GitHub，已运行的 0.2.2 不会自动加载源码修复。从旧版本升级到包含修复的版本时，仍由旧版下载器负责；此后的更新才使用新实现。四路并发不能保证突破网络/CDN的总带宽限制。
