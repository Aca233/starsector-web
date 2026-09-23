# Phase21 客机主线程与联机接收：实施前证据 / 边界

2026-09-21。用户要求继续完成优化，完成前不再发进度通知；不发布、不触碰生涯、不启用子代理、不操作桌面。

> 最终采用：离屏船体覆盖层裁剪 + SpriteBatcher 保守裁剪。下文最初的 I/O Worker 解码方案只是实验，已完整撤回，并未默认启用。

## 证据
- Phase20 自然 5 人 / 22 舰：权威约 60Hz，客机完整状态30–33Hz，确认指标115–157ms，说明仅减房主粒子计算不足。
- 本轮 `baseline-profile` 的真实5人无头运行，在12秒后段进一步降速：主线程CPU采样出现 `CombatSnapshot.unpack`、完整二进制 preflight/read、伤痕Canvas组合及 `texImage2D`/过载mask `getImageData`。同时有大量 idle，不能将每个掉帧全部归于单个JS热点。该单机GPU/多页面/CDP争用基准不冒充多机n2n延迟。
- 当前I/O Worker已做binary delta重建，但全部完整帧 `decodeBinaryState/JSON.parse` 仍在客机画面线程；权威本地显示已有独立decoder，客机尚无。第一步把严格同一decoder移至已存在的I/O Worker，保持控制消息/消费确认和顺序、不增网络格式。
- 原版0.98a渲染来源 `../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/String.java` 的770/771及770/1混合、stencil；`OOoO.java` 的整数通道 `Color(255, floor(amount*.65), floor(amount*.25), floor(amount))`。本轮任何Canvas/缓存优化只能改变存储或执行位置，不能降采样伤痕、量化热度、删效果或改原生随机/伤害。
- Web已有 `ShipDamageVisuals.ts`、`ShipOverloadRenderer.ts` 为当前画面基准。原版实机截图验收仍待许可，不能冒充完成。

## 预期与验收
- 只允许私有Worker事件带已解析帧，远端任意JSON对象不能伪装本地解码结果。native WebSocket/无SAB/Worker启动失败保留原路径。
- 默认启用由LanConnection请求；泛用LanSocket不主动改变原message的string/ArrayBuffer接口。保留构建回退。
- 展开后的字节与消息队列预算仍在post前预留，失败/抑制/关闭必须归还；没有后台自动ACK，主线程同步订阅者留存后才按原逻辑ACK。
- 隐藏状态不解析大帧、不ACK；delta的epoch、错误、重连处理不弱化。解析错误仍交原协议错误通道处理。
- 测试覆盖实际bundled Worker、binary/JSON/delta、握手/隐藏/关闭/拥塞/错误、事件来源与确认顺序；真实无头多人及小范围配对CPU探针。仅保留实测有收益的优化，不以改HUD数值制造60Hz。

## 追加：已确认的离屏渲染浪费
- `WebGLShipPass.renderShip` 对所有可见阵营舰船生成Canvas伤痕/热光并上传纹理，不检查该舰船是否在当前相机屏幕内；22舰即使多数不在画面中仍做组合。推进器已有视口剔除，伤痕及过载贴图没有。
- 原伤痕组合严格clip到完整舰船sprite rectangle（残骸再clip polygon），过载mask同样限制于hull纹理；因此只有完整旋转sprite四边形与viewport严格分离时，跳过这两层才可证明不损失像素。保留2屏幕像素及Float32误差余量，异常参数fail open。
- 只省CPU/纹理准备，不修改ShipDamageState.advance、热度、颜色、随机、可见舰艇效果或模拟。瞬移分身按各自位置/角度判断；残骸按sourceOrigin判断。武器/引擎/排气等可能伸出船体的效果不跟随此裁剪。
- 软件Canvas的单独配对探针未获得收益（0.394→0.429ms，像素相同），不把willReadFrequently强制用于动态伤痕，不做无收益“优化”。
- 离屏伤痕配对WebGL初测：8相机/缩放/残骸案例零像素差，22舰注入高热场景21.24→3.63ms（包含GPU finish），上传2619→241。继续将SpriteBatcher的完全离屏quad在纹理选择前做保守粗裁剪，保留所有可能覆盖像素的quad，不改混合次序；原版GL自身也在clip space裁掉完全离屏几何。
- Sprite粗裁剪使用rotation-independent L1半径（覆盖所有旋转角）、实际Float32实例值和完整view-projection矩阵，异常值fail open；不能直接用船体半径裁武器或排气。验证10000随机变换与完整渲染像素。


## 实验取舍与验收工具修正
- 客机在 I/O Worker 解码再 structured-clone 完整状态图：同种子五人对照未显示稳定Hz收益，且增加对象复制与消息排队。已撤回 socket/protocol/Worker 实验代码，保留 rejected-worker-decode.patch 和 on/off 测量；不把“放客机/Worker”本身当作性能结论。
- 两次五人测试 Node 4GB OOM 不能算验收通过。追加采样表明主要存活分配集中于 Playwright 的 PlaywrightConnection._dispatcherConnection.onmessage（launchServer → connect 代理序列化），viewers/evaluate 在代理积压时迟迟无法返回。诊断运行保存堆采样及内存轨迹后，只停止该次自有测试进程树。
- 验收工具改为 chromium.launch 的直接连接，仍是独立无头配置，不接触用户浏览器/桌面。相同五人图开始至关闭通过，Node堆回到约120–132MB（短诊断样本），不是通过提高堆限制压住错误。另做60秒测量+卡顿+重连，结果记录在 Phase21 报告。
- 新增测量阶段即时落盘、阶段日志、可选 MULTIPLAYER_HEAP 采样、关房后再卸载视图。都是测试工具改进，不是修改线上确认窗口/缓冲预算。
- 运行日志新增 hud.renderCulling：两项实际构建开关、主sprite批次剔除数、伤痕/过载覆盖层剔除数，便于确认生效；缺失字段仍为unknown，不伪装true/0。
- 同机多页面与其它后台任务存在资源争用；固定浏览器源码和seed降低实现漂移，但不意味着网络时序和AI战场在两次运行中逐帧相同。Node中转源码未冻结，不将这些短测冒充严格WAN因果实验。
