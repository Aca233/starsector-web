# 联机主线程热光贴图读回：修改前证据（2026-09-25）

## 本轮定位
重新检查当前Owner.plan：只执行CapitalShipAI.update，不执行ShipWeaponControlSystem.update。已有固定world字段wire实验曾因整体尾延迟不佳撤回，不能重复当作新方案或靠加线程宣称武器计算并行。

冻结当前650个非生涯前端源码，实际LanBattle + 普通房主Worker + WebSocket/relay/helper + WebGL双副本测量（2玩家Onslaught、20 AI Hammerhead、seed917、15s、无输入事件注入）。physics采样中位59.834Hz，完整帧31/29Hz；两页采样FPS约13。独立无头Chromium使用SwiftShader软件渲染，同时CPU profiler开启，因此不能据此宣称用户真实GPU会有同样FPS/延迟。

主线程接收restore采样约3725/3469ms，仍是长期瓶颈。另有getImageData约345/999ms，调用栈完整落在tintGlowTile→drawShipDamageDecals→renderShipDamageOverlayCanvas→WebGLShipPass。它只在各原图第一次着色时发生，但GPU偏好的2D画布先drawImage再同步读CPU像素会产生首次使用等待。本轮先验证这一可独立消除的同步边界，不用它冒充模拟或全部接收提速。

## 原版证据 → 不变的像素规则
原版0.98a-RC8。本次修改前阅读本机 decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/OOoO.java:160–168，热量控制整数G/B/alpha通道；String.java:159–188，经舰体alpha/stencil遮罩绘制。反编译异常不照搬，当前Web glowColor/像素乘法、源资源和遮罩结果作为新旧逐字节对照基线。

不改变资源、颜色、透明度、大小、旋转、遮罩、数量、衰减或缓存键；不修改模拟、网络协议和频率。没有原版桌面操作或实机视觉补验。测试使用原资源及实际Canvas渲染，不能当作全WebGL/原版画面等价证明。

## 候选与边界
为tintGlowTile专用的2D像素处理画布显式使用willReadFrequently:true，使浏览器可选择CPU读写友好的后端。该函数本来就读源RGBA、CPU修改通道、putImageData、按整数通道缓存小图块；不是逐帧GPU render target。所有计算/缓存/最终overlay/WebGL上传逻辑不变。不设置游戏全局Canvas为软件后端，不新增visible窗口或GPU compute。

这只是后端提示，不保证每个浏览器或GPU都会加速。必须同时验证首次小图块创建、已有缓存/完整overlay绘制上传是否回退以及像素是否一致；失败则撤回，不通过减少首次调用来掩盖成本。

## 验收方式
扩展已有benchmark-damage-canvas可选旧/新源比较：虚拟导入冻结旧/新ShipDamageVisuals（共享Vector2/资源模块，但私有缓存独立），只在测试构建导出私有tint函数。用六张真实glow资源、0–255全部整数热量比较RGBA及缓存身份；完整hull遮罩overlay比较；已有120帧draw+WebGL上传流程交替计时。另用相同冻结前/后源运行普通双人22舰链路（无profiler）检查窗口、关键通道、收包与错误，不将不同墙钟战斗窗口当确定性配对或输入到屏幕测量。

完整实现后集中typecheck、修改文件lint和既有Canvas场景，仅修复具体失败后定向重跑。独立无头浏览器，无子代理/键鼠注入/桌面/发布/打包/提交。

## 第一候选验收失败后的定向修正
D3D11/RTX5060实测：最终一次mixed-heat overlay一致，但1536个tile比较有21049个通道值不同(max1)，热身绘制+上传均值0.389→0.531ms。不能因首次创建更快而接受像素差异。多次overlay读回还可能使默认2D后端自适应切换，因此下一次把每个像素用例隔离到新的最终overlay画布（读取一次即释放），另直接对照六张原图在两种读取后端的RGBA，区分源像素转换与最终贴图后端问题。

第二候选仅让一次性源像素读取使用独立willReadFrequently画布；所有缓存tinted tile仍保持原本getContext('2d')，不强制更改用于实际drawImage的贴图后端。原公式/最终putImageData不变。若源读回或最终像素仍不等，则撤回该路线。

## 完整链路首轮后的定向修正
第二候选D3D11与SwiftShader各1536个tile、512个新overlay画布比较均为0差异；充分预热480帧后draw/upload中位与P95相同。但完整22舰单次AB中客机FPS中位58.067→52.260、ACK派生P95 42.109→52.263ms，不能声明无整体回退。两轮墙钟窗口tick203–1101与202–1102接近而非确定性同窗。

进一步收窄变更：保留旧实现第一次对最终tile调用ctx.drawImage(image,0,0)的初始化步骤，仅把同步getImageData搬到CPU scratch。这样不再删除旧最终tile的首次绘制；后端依然由浏览器选择，不能保证具体GPU驻留方式。读取返回后仍以同一完整ImageData覆盖tile。用同一像素场景针对性复查，再以反序BA完成联机对照，保留首轮不利数据，不择优报告。
