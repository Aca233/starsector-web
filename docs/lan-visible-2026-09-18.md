# 双队联机舰体可见性修正（2026-09-18）

## 已确认的问题与修正

createLanWorld 之前仅在至少三队时开启公开战场；双队使用传感器可见性。WebGLShipPass 根据 isVisibleTo 跳过舰体，而远处炮火、弹道等效果仍可能显示。11 舰双队内存场景复现 2 艘在场舰体因视野被隐藏（9/11 可见），并非透明度变零或贴图 URL 丢失。

统一所有 LAN 队伍数量的公开视野：主机初始化及后续 fixedUpdate、客户端还原和雷达共同使用现有公开战场规则。修复后同场景 11/11 可见。单机传感器规则不改，未部署/撤退/停靠舰船不会因此出现。公开视野同时会让 AI 更早获得远处敌方接触，不是仅客户端绕过战争迷雾。

## 验证与限制

- 子代理核对所有敌友/后备舰贴图均进入资源集合，Onslaught/Paragon 图片返回 200；未改贴图代码。
- 实际 WebGL：双队四舰间隔 7000 世界单位，真实快照还原后，房主和客机视角逐舰检查贴图 decoded、舰体 draw call、非黑像素及 GL error；通过，零页面异常。
- TypeScript 与构建通过；lint 退出 0，其他正在修改的 portable-update.mjs 有一条 no-control-regex 警告。
- 没有确认截图中所有离屏舰船的问题都仅由传感器导致；未改镜头/缩放。
- 60Hz 目标与默认关闭 AI 多 Worker 保持不变。

## 运行状态

构建：artifacts/lan-visible-preview。替换 3005 曾被执行策略拦截，原 3005 保持不变。用户随后明确要求启动新的实例，现已在 http://127.0.0.1:3007/?view=lan 正常启动修复版（PID 56528）；HTTP 200 与构建标识核对通过。3007 包含舰体可见性修复、固定 60Hz 目标，AI 多 Worker 默认关闭。

证据位于 artifacts/lan-visible：before.json、after.json、render-result.json、deployment-status.json。诊断浏览器与临时 Vite 服务已经关闭。
