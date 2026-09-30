# 联机战斗生产式JS路径诊断（2026-09-28）

## 为什么换测量路径
上轮火控惰性排序完成行为验证和唯一ABBA，但两组完整热段收益0.6959%/3.7859%，未达到每组3%，已精确撤回。这是有效排除证据，不是新增性能收益。
当前vite.config.ts:worker/build使用ES Worker及生产Vite打包；既有scripts/check-normal-multiplayer-browser.mjs:102却以createServer开发模块运行，页面149行动态导入源码。此前冷启动profile不能直接代表发布构建。

## 本次不改生产代码
冻结当前非生涯源码图、完整game-assets/content和完整index/lan/motion CSS；仅在artifacts内建立独立LanBattle导出入口，Vite production模式打包main与其真实Worker，minify=esbuild、ES Worker、标准target、相同vendor分块。使用原LanBattle/host.worker/LanConnection/WebGL/relay/helper，不复制模拟引擎，不预推进、不减实体、不改60Hz或过载/ACK/接收校验。默认关闭五模拟实验、display-v2、呈现/AI/序列化Worker；其它既有默认语义保留。诊断入口只有React/createRoot/LanConnection/LanBattle导出，不导入或打包生涯入口，不产生发布包。完整CSS使用既有冻结器，资源不做WebP重编码；因此称生产式战斗JS构建，不冒称完整安装版逐字节等价。

## 单次诊断与边界
复用既有双无头客户端场景：1280x720、D3D11、2玩家+20AI、三舰循环、seed917、3200DP。通过测试专用Node loader把页面源码imports替换为编译入口，并仅静态托管精确输出文件；浏览器不得请求/src模块或开发React。实际资源和bundle请求、源图/额外加载输入SHA留档。
只运行一次。启动Worker创建后采集最多5秒CPU样本，原有启动/20秒输入测量/800ms主线程阻塞ACK/重连流程不放宽。采样有开销，本轮不是无插桩A/B；不能拿它与旧开发态数字混算收益，不能因为一次启动通过就默认打开任何实验。启动失败则记录真实阶段/最后tick/恢复错误并正常关闭浏览器、helper、relay。若需要定向修复诊断脚手架，在游戏开始前的失败独立留档；不得重跑已完成的性能区间挑结果。
无玩法/界面功能修改，所以沿用本机0.98a-RC8既有private.java/WeaponGroup.java行为边界；不进行原版桌面操作或宣称原版实机还原验收。目标仍是实战模拟速度和延迟，离线微测试不足以宣称目标完成。

## 执行后的澄清
实际有三次游戏开始前脚手架失败：CRLF锚点、开发JSX/生产React混用、测试bundle托管缺COOP/COEP导致Worker被阻止。只对具体失败定向修复，日志和旧版本全部留存；前三次无有效模拟/性能区间。v4为唯一有效生产式CPU诊断，真实启动后持续过载、有效输入测量未开始，没有另跑性能对照或放宽保护。完整结果见 lan-production-path-diagnosis-result-2026-09-28.md。后3秒idle来自模拟停止之后，热点另列同一profile的非idle口径，不能当全机CPU利用率。
