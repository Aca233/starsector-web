# LAN 呈现命令通道：实现前记录（2026-09-25）

## 原版证据
原版 0.98a-RC8：`../starsector-core/data/config/settings.json:8-12`（60fps/vsync）；`../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatUIAPI.java:12-27`（指挥界面/部署界面/当前选择/玩家操控禁用读取）；`../starsector-core/data/config/sounds.json:2986-2993` 的指挥界面选择与清选音效。当前 Web `SoundBank.ts:64-73` 映射对应资源，但音量和完整交互原版等价未实机核实。本轮保留 Web 既有音量、浮字和权限，不声称纠正原版交互。不启用桌面、可见窗口、键鼠或子代理。

## 证据 → 预期 → 当前差异
已有 UI 跨线程通道只能读，LanBattle 仍直接改 engine.isTacticalMap、部署后假定 tactical(close) 同步完成；跨线程后不能把 postMessage/Promise 创建当作操作成功。TacticalMap 已支持 Promise，但旧回调在 source 关闭/重同步后读取可能抛异常，需保留失败/取消保护。

增加有界 observer 命令请求/结果，限定地图开闭和既有 select/close；敌方/死亡舰船由呈现所有者执行时重新校验。联机开火、目标、战术订单及部署/撤退权限不得借此绕过主机。owner/epoch/id 顺序执行、重复幂等、有界结果缓存，错误代际不能写当前世界。结果包含命令后的最小 UI revision；接受通知须等实际后续 UI 发布到达，避免旧选择/旧地图状态搭配成功提示。慢主线程仍只保留一包 UI，最多保留有界小命令，不存整帧。

默认主线程仍同步执行，不多加一跳或 timer；正式 LanBattle 的开地图和部署后关闭都通过同一端口，并等待真实结果。stop/reset/dispose 作废旧命令 continuation。Worker 命令的 UI 音效在实际执行时收集，主线程确认后仅播放一次；浮字留在所有者世界，不能重执行重复请求。

## 验证
先冻结现有660非生涯模块，保留无关WIP。整块实现后集中 typecheck、改动文件lint，扩展既有Offscreen场景进行实际Worker命令/UI/缓冲区回执验证及生命周期反例。不跑全套；只在具体失败后定向复查。不宣称正式联机Worker已启用、不宣称吞吐/FPS/延迟提升，不提交、推送、打包、发布。## 实现后记录
- 新增 `LanPresentationCommands.ts`，使用现有实际 `LanPresentationRuntime` / `LanPresentationViews`，不是另建测试专用世界。观察命令限定地图开闭和选择；服务端部署/撤退请求继续走原有权限路径。
- 成功等待 owner 执行和主线程收到命令之后的 UI revision；这证明读视图已更新，不等于 GPU 已绘制或端到端延迟已改善。旧在途 UI 不可满足成功条件。
- owner 幂等历史和 client 等待表分别上限16；UI仍最多一包在途。等待 UI 信用期间只保留 dirty 位，不积压世界快照。
- 抽出原有 UI 音效到 `combatAudio` 的同步作用域捕获，主线程在确认后播放一次。默认直接打开地图原本无音效，继续保持；选择 .8、清选 .7、关闭 .85 保持不变。
- 实现期间发现并修复：混合 command owner / 普通 UI publisher 的关闭与重建；同步 send 回调后又抛错不能提前成功；音效回调重入时检查代际/关闭状态；revoked source 的迟到 Promise 回调不得再读失效视图。
- 首轮类型检查发现 select 操作的 unknown 联合收窄不足，拆成 null/string 分支修复；移除 this 别名 lint 警告。最终检查通过。
- 最后审查发现待确认地图打开会暂时屏蔽飞行输入，而 stop/freeze 仅清请求 token 可能遗留屏蔽。现同时恢复当前 overlay 屏蔽状态；关闭地图/部署窗口仍保留其他待确认地图请求的屏蔽。56组实际回调源码探针通过，未冒充 React/键鼠端到端测试。
- 仍不启用正式联机 presentation Worker；未改模拟频率/精度、实体或特效数量、权威判定，也未增加 GPU 计算。验收范围见同日 validation 文档。
