# 热光源像素读取：性能与验收（2026-09-25）

## 结论
保留一个窄范围的首次贴图卡顿优化：只将每张原图第一次`getImageData`放到独立的`willReadFrequently:true`临时Canvas。最终缓存tile仍使用原来的默认2D context，并保留原来的第一次`drawImage`初始化；随后仍按原整数通道公式生成相同ImageData、完整覆盖、按原key缓存。

**不是GPU compute，不是模拟提速，也没有证明整体ACK延迟改善。** 不改模拟频率、伤痕数量、热量衰减、遮罩、网络通道或验证。没有生涯改动、桌面/键鼠操作、子代理、提交、打包或发布。

修改前证据见`lan-glow-readback-source-notes-2026-09-25.md`。原版0.98a-RC8源码核实了整数通道和遮罩规则；本轮像素检查只证明新旧Web渲染在所测后端一致，未进行原版实机UI验收。

## 为什么没有采用最初的一行修改
第一候选把所有tinted tile直接设为`willReadFrequently:true`：1536个tile比较出现21049个通道差异(max1)，并有warm draw/upload回退迹象，已撤回。其初版overlay逐帧读回还会触发Canvas自适应后端切换，故不将当时的大量overlay差异计为可靠的生产差异证据。

第二候选只使用CPU scratch reader，但删除了最终tile原来的首次drawImage。像素全部一致，局部cold更快，然而首轮完整联机客机FPS 58.067→52.260、ACK派生P95 42.109→52.263ms。因此进一步保留原初始化步骤，而不是忽略这轮不利数据。

最终版本只替换同步读取位置。在浏览器看来是否驻留GPU依旧属于实现选择；保留API创建/绘制顺序不等于保证某种物理驻留。完整链路第二组采用反序“最终版→旧版”。两组candidate不同，**不是同一版本的ABBA统计实验**，不能混合平均或宣称统计显著。

## 环境与源隔离
- 独立无头Chromium 151.0.7922.34 / Windows；硬件报告16逻辑线程。
- D3D11报告：NVIDIA GeForce RTX5060，真实GPU；另验SwiftShader Vulkan软件后端。
- Canvas测试无profiler。最终普通联机测试无profiler、无stall/reconnect、无输入事件注入。
- 冻结650个非生涯前端源码：旧/最终仅`src/engine/render/ShipDamageVisuals.ts`不同，结束时生产源码漂移0。
- 普通联机脚本、relay、desktop bridge、diagnostic parser哈希与开始时一致。Canvas脚本也保存源码/哈希。
- 原始工件均在`artifacts/lan-pipeline-20260925/`；历史phase21输出未覆盖。

## 最终Canvas逐字节检查
扩展既有`benchmark-damage-canvas.mjs`，默认仍做overlay后端探针；可选baseline/candidate虚拟模块以同一资源/类图加载旧、新实现，私有缓存互相独立。私有函数/缓存仅在测试虚拟模块导出，不为生产增加调试接口。

D3D11、SwiftShader每个后端均通过：
- 六张真实48px glow原资源，两种source reader的RGBA完全一致。
- 6图×256热量＝1536次tile比较，14,155,776字节：**0差异**。
- 完整舰体及局部碎片遮罩×256热量＝512次overlay比较，226,492,416字节：**0差异**；510次有非空可见像素。
- 相同整数通道key始终返回同一个Canvas，每图179个实际整数热量key。
- 暖机120帧、测量480帧；测量前后每个lane六图均维持179个缓存项，没有把新建tile混进“充分预热”的结果。
- parity用每例全新的overlay画布，每个只读一次后释放，避免连续getImageData触发单边后端迁移；计时窗口内不读取像素。
- 伤痕数据未变；浏览器及WebGL错误为0。

### 冷创建：每lane 48个新Image身份，解码/资源IO在计时外
单位ms，包含首次源读取和首次tile变色创建；交替新/旧顺序。不是每帧成本。

| 后端 | 均值旧→新 | P95旧→新 |
| --- | ---: | ---: |
| RTX5060 / D3D11 | 0.948→0.140（约−85.3%） | 1.400→0.200 |
| SwiftShader | 0.952→0.215（约−77.5%） | 1.600→0.300 |

单次100伤痕fixture首次overlay绘制+上传旧→新：D3D11 99.2→9.8ms、SwiftShader 316.6→10.1ms。这是两个模块冷缓存的单帧示例，包含Canvas初始化/浏览器调度且lane顺序固定，**不作为普通战斗卡顿或P95的提速承诺**。

### 缓存充分预热：100伤痕、同样480帧，交替顺序
实际overlay绘制、WebGLTextureManager上传、gl.finish。均值易受GPU等待离群值影响，同时报告中位/P95，不能只拿all均值作为持续提速证明。

| 后端 / 阶段 | 均值旧→新 | 中位旧→新 | P95旧→新 |
| --- | ---: | ---: | ---: |
| D3D11 draw | 0.219→0.228 | 0.200→0.200 | 0.300→0.300 |
| D3D11 draw+upload | 0.826→0.755 | 0.300→0.300 | 0.500→0.500 |
| SwiftShader draw | 0.476→0.481 | 0.400→0.400 | 0.900→1.000 |
| SwiftShader draw+upload | 1.336→1.159 | 0.600→0.600 | 1.500→1.500 |

没有稳定的持续绘制加速证据；SwiftShader单独draw P95增加0.1ms，完整draw+upload P95不变。缓存命中单次时间低于此非隔离页面计时分辨率，不报告虚假的纳秒收益。

## 完整普通联机：保留所有结果
实际LanBattle + 房主Worker + WebSocket/relay/desktop helper + 两个1280×720 WebGL副本；2玩家Onslaught（不注入输入）+20 AI Hammerhead，AI正常战斗，seed917，D3D11，墙钟测量15s。

| 版本 / 执行顺序 | tick窗口 | 物理Hz采样中位 | 主/客FPS采样中位 | 主/客ACK派生P95(ms) | 主/客state-age P95(ms) |
| --- | --- | ---: | --- | --- | --- |
| 旧A1 | 203–1101 | 59.908 | 60.002 / 58.067 | 61.504 / 42.109 | 6.890 / 17.970 |
| 第二候选B（不保留） | 202–1102 | 59.900 | 60.002 / 52.260 | 64.466 / 52.263 | 13.535 / 11.725 |
| 最终版B' | 205–1104 | 59.946 | 60.002 / 58.067 | 68.976 / 49.229 | 17.380 / 17.255 |
| 旧A2 | 203–1103 | 59.972 | 60.002 / 58.068 | 64.962 / 43.372 | 12.090 / 16.660 |

最终版与紧随的旧版：完整快照主/客59/55Hz vs59/56Hz；客机motion均60Hz。四轮房间保持running、两端loaded/connected、无authority/browser错误、均完成清理；direct I/O与shared admission保持启用。

**边界：最终FPS与旧版相当，但ACK派生尾延迟没有改善，第二组反而主+4.014ms / 客+5.857ms。** 这些是每秒HUD样本的统计，不是原始输入事件样本、输入到屏幕延迟或物理显示时间。无用户输入夹具、只有一组最终版反序对照，不能因没有功能失败就声明整体延迟优化完成。循环回环、同机双副本也不是WAN/Steam/n2n或跨机器性能证据；起止tick计数不直接当精确物理Hz。

最早profile-22是SwiftShader且开了三份CPU profiler，其约13FPS不能与这里真实GPU/无profiler的约58–60FPS相减来宣传提速。该profile仍支持接收restore/validation和权威pack/weapon update是下一阶段较大瓶颈，不支持“把CPU/GPU占满就能解决”。

## 验收与复现
最终源类型检查、仅修改的TS/MJS lint、diff whitespace检查通过。最终canvas两后端、第二组普通联机均exit0。检查结果：`accepted-check-status.json`、`canvas-final-status.json`、`multiplayer-reverse-status.json`、`final-drift.json`。

PowerShell下先设置Playwright依赖：
```powershell
$env:NODE_PATH='C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:DAMAGE_CANVAS_BASELINE='artifacts/lan-pipeline-20260925/before/src/engine/render/ShipDamageVisuals.ts'
$env:DAMAGE_CANVAS_OUT='<新的输出目录，不覆盖原结果>'
$env:DAMAGE_CANVAS_ANGLE='d3d11' # 或swiftshader
$env:DAMAGE_CANVAS_WARM_FRAMES='120'
$env:DAMAGE_CANVAS_MEASURE_FRAMES='480'
node scripts/benchmark-damage-canvas.mjs
```
另可用`DAMAGE_CANVAS_CANDIDATE`显式指定冻结候选文件；缺省为当前生产源码。

普通联机使用现有`check-normal-multiplayer-browser.mjs`，`MULTIPLAYER_FROZEN`分别指定baseline-sources.json和final-sources.json；PLAYERS=2、AI=20、MS=15000、SEED=917、STYLED=true、ANGLE=d3d11。PROFILE/HOST_PROFILE/STALL/RECONNECT及所有STEADY/COMMAND_HELD/WEAPON/PREDICTION/PARTICLE夹具显式false，OUT使用新的路径。

本轮止于减少首次贴图同步等待；大规模模拟、主线程完整接收解码和整体尾延迟仍未解决，不将任务标记为完成。
