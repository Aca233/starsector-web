# 私有主机系统列表单次分配（实现前，2026-09-27）

## 证据与目标
原版0.98a-RC8，本机ShipAPI.java:91–92分别暴露防御/主技能，:336读取实时相位。Web多战术技能是已有扩展，保留主兼容槽、systems[1..]、防御槽的顺序，不删多技能。当前allSystems每次slice再spread生成新数组，最近冷启动诊断自耗88.153ms；不将采样当提速数据。历史LAN owned-phase接线失败不重启；本轮不修改isPhased，不省略系统状态读取，改getter的原数组构造成本。无原版实机/UI操作。

## 闭合域与行为
仅VITE_LAN_OWNED_SYSTEM_LISTS=true在私有Host init创建世界前启用。Ship构造的普通systems数组在该realm以私有WeakSet登记；未知替换数组、反序列化替换、公开realm全部保留原slice/iterator/species路径。协议不传函数/访问器，不把WeakSet身份当同realm沙箱，不允许对已登记数组篡改原型/内建或安装索引访问器的插件。src/engine中systems唯一赋值位于Ship构造，当前原生更新不修改数组原型。

每次getter仍先读main，再读systems，最后读defense，返回独立普通Array。零/单战术槽返回[main,defense]，多个槽按当次长度逐项复制；不缓存成员或系统值，不把systems[0]替代兼容主槽。快照列表之后执行的system callback替换槽位只影响下一次查询，旧列表不变；嵌套查询各有新数组。数组品牌只在显式启用后的构造注册，初始化/重建都要验证，不自动给外部或恢复数组补品牌。

## 预注册验收
两个生产文件before保存。一次typecheck/lint；借既有真实176实体734挂点init/reinit/default和60完整fixedUpdate authority+隐藏tracker/RNG对照，新增getter与旧体的公开访问顺序/异常/custom slice/iterator/species/未知数组回退、零/单/多槽/稀疏槽/动态替换/返回数组修改隔离/嵌套快照合同。非计时透明slice计数确认实际去掉中间分配，不把计数当整步速度。

一次独立隐藏Node进程ABBA，四既有实验两臂均true，同seed917/2玩家+20AI三舰循环/3200DP，每臂150热身+120计时完整步。两组分别至少省3%、完整终态一致才保留；不择优重跑，不改门槛。通过再进行一次既有完整CSS的176实体浏览器验收（普通/输入后70ms压力、800ms停顿ACK、同局重连），不把离线收益称为网络/屏幕延迟改善。默认关闭、不提交/推送/打包/发布。
