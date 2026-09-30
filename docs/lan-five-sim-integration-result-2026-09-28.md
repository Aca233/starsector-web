# 五项模拟优化组合：未达到默认晋升条件（2026-09-28）

## 结论
五项全关/全开组合的60步正确性对照通过，但唯一真实双客户端候选功能验收仍在启动阶段持续过载，未进入有效20秒输入测量。**五项继续默认关闭，未执行性能ABBA，不存在本轮组合累计提速百分比。** passesPrescribedGate=false，不以驱动脚本exit0冒充成功。没有降低Hz/精度/实体/画质、放宽过载/回执/权限保护，也未提交或发布。

本轮唯一保留生产改动是 ContentValidation.ts:91 的已实现 arkFighter 护盾样式登记。这是初始化阻断修复，不是提速补丁；除这个精确白名单成员外未改变校验。其它任务的美术/渲染和资源工作均保留。

## 前置失败与定向修复
1. 初次冻结756模块，off bundle尚在ModManager导入阶段就失败：web_ark_interceptor.shieldProfile 值无效: arkFighter。它不由五项开关导致。现有类型与渲染实现已支持该样式，但校验仍只有旧四项。
2. 保存原文件字节和SHA，只添加arkFighter；新v2冻结包含此修复，A/B相同，不计入优化收益。一次typecheck和该文件lint通过。
3. 新测试第一次错误地假设三舰场景有显式visualProfile；实际上继承默认样式。只将校验夹具改成合法的显式profile，实际场景和bundle不变。此前失败脚本/日志保留。
4. 所有5种渲染支持的shieldProfile/fortressShieldProfile均通过；未知、空值、__proto__、constructor及坏颜色仍拒绝。场景真实初始化也通过。
5. 五项全关/全开60步：技能、近距交火、排散、低血模块，逐步完整authority和隐藏RNG/autofire一致；初始176实体/734挂点。源图与执行输入都有SHA。

## 并发改动隔离
浏览器启动前先后检测到其它任务对5个源码文件、资源清单的更改；两次均在创建浏览器前中止，不是性能重试。
- 使用已通过正确性的756模块v2不可变源图、完整冻结CSS，未覆盖其它任务的现场文件。
- 另捕获完整game-assets：2590个文件、96,729,580字节。仅本次隔离测试服务器的资源请求和测试资源预检改读这份快照，未修改生产HTTP/接收校验；两处测试加载变换原/后SHA及源码均保存。
- 资源清单变化后只定向复查组合场景，要求61个逐步状态hash与前次完全一致；通过。
- 实际浏览器请求115条资源全200；实际Node加载171项记录SHA。两次运行的保护输入和实际Node输入都无漂移。
- 现场仍有并发源码/资源差异，故冻结验证不是当前持续变化工作区的自动晋升许可。无需停止或撤销其它任务。

## 唯一候选浏览器功能验收
现有check-normal-multiplayer-browser，真实LanBattle/权威Worker/双客户端relay/helper/WebGL；1280×720、D3D11、2玩家+20AI、seed917、3200DP，三舰循环。仅五项模拟开关true，display-v2/呈现Worker/AI Worker/序列化Worker保持原默认关闭。没有使用稳态预推进、降低负载或跳过启动。

两个客户端确认22根舰、56模块、70战机、28轰炸机，合计176实体；读数属于同步/失败前，tick=-1，不能当作可控稳态。房间以“计算主机持续过载或暂停过久，恢复失败”结束。harness等待可操控画面30秒超时，cleanupCompleted=true。errors数组为空不代表通过。

原始权威遥测只有冷启动样本（完整列表在final-state.json），最高到tick13；其中tick13一条lastStepMs=147.24、maxStepMs=646.04、captureMs=93.133、encodeMs=33.279。这不是120热步均值，不能与此前Node约34ms/步跨环境相除为回退倍率，也不能用失败后的重复HUD读数补采样。

没有有效稳态Hz、输入P95、800ms阻塞回执或同局重连验收。按预登记停止默认晋升流程，没有启动A/B/B/A，也没有改变通过门槛。

## 一次失败定向CPU诊断（不是复测收益）
同一冻结候选与资源，单次短启动CDP profiler，首次过载后立即收尾：2100.152ms / 1508样本，cleanup=true。
- fixedUpdate inclusive 71.70%。
- CapitalShipAI.update inclusive 25.53%；ShipWeaponControlSystem.update inclusive 22.99%。
- assessThreats inclusive 9.58%。
- 捕获 6.44%；编码 3.51%；GC 3.34%；idle 8.89%。
这些桶互相包含，不能相加，也不是稳态CPU利用率、GPU利用率或全部机器负载。主耗时仍在AI/火控模拟；不支持仅靠对象池、额外线程或切GPU就能解决的结论。

## 后续边界
五项实验的离线收益继续有效于各自已登记场景，但不能代替默认真实联机交付。后续需要减少AI/每挂点火控的整体重复工作或重新划分计算数据流，不能原样复活已失败的相位缓存、系统列表、武器属性program/WASM小循环，也不应通过放宽过载保护掩盖问题。原版实机未操作，整体优化目标未完成。

工件 artifacts/lan-five-sim-integration-20260928：final-state.json为最终裁决；browser-on-once为唯一功能运行；startup-diagnosis-once为单次诊断。源码说明见同日lan-five-sim-integration-source-notes和lan-five-sim-startup-profile-source-notes。
