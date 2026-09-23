# Phase39：低Hz的生产端证据与未启用的绘制候选

## 结论
本轮没有新增启用的绘制优化。4→8→16纹理批次像素一致，但完整场景没有显著总耗时收益，生产SpriteBatcher已逐字节还原到本轮之前（SHA256 8711b829f0a0900e2f33d52fb754a71ff375e608522e5df7a38aaa9c5ad6cbdc），不覆盖更早任务的WIP。保留Phase38固定字段恢复。

## 已测事实
- 5人纹理探针16.287秒中guest1无舰体覆盖层上传，仍54完整Hz/48.4FPS。其他视点热光API累计14–70ms，单次最大约1ms。估算上传字节不等于GPU时间，不能据此重写热光系统。
- RTX5060/D3D11：32种像素/资源案例及22船、169弹体完整场景零像素差。4/8/16纹理分别100/98/96draw，均值1.381/1.341/1.376ms；P95 1.7/1.6/1.8ms，没有实质总收益，撤回。
- 相同轨迹的5人独立浏览器与共享浏览器A/B：独立进程客机FPS全60.003，但完整Hz45/41/45/42；共享浏览器46.45/41.25/46.45/40.65FPS、57/52/53/56Hz。两组房主物理约59.9Hz，完整检查点与有效输入相同。只做A/B，未做反序，不是多机远程结果。
- command-held独立浏览器5人，900物理步/约59.832Hz，被652次推进回调合成652份完整状态；651次本地socket准入、1次跳过。发布tick恰好等于推进回调末tick。客机34/34/36/35完整Hz，但全60FPS。不是单凭客机render慢或网络丢包即可解释。
- 回调墙钟包含调度/yield：推进回调P50 10.04/P95 54.02ms，发布准备P50 4.49/P95 10.24ms。本地完成P50 1.14/P95 17.05ms不是远端ACK/RTT。
- 独立host Worker CPU采样约17.84秒：fixedUpdate包含43.57%，snapshot包含26.30%，capture约15.38%，编码9.8%；pack自身10.18%。包含项不能相加，CPU profiler与同机竞争均有扰动。

## 负证据/边界
首次publication-profile在两阶段夹具tick61等待客机失败，保留原失败，不延长12秒恢复或减弱断言。command-held避开该次人工暂停，是不同合法场景，不证明原问题已修复。后续Phase41单独验证同tick跳过合同，不能倒推这一次历史失败必然同因。

纹理/发布探针均仅测试用。发布blocked包含已是当前tick，并非credit饥饿计数；探针步骤墙钟非纯CPU。共享浏览器单GPU进程与独立5GPU进程都在同一台机器，不能推算用户n2n/Steam RTT。

后续修正future battle-server-inputs根，覆盖texture/publication探针；原Phase39依赖清单未含这两个入口，不伪称当时已覆盖。初次typecheck脚本转义错误及首次publication-profile失败均保留。归档后的绘制候选需用新目录重跑，结果见phase39验证清单。

证据：artifacts/network-stream-20260922/phase39/下publication-summary.json、host-cpu-summary.json、browser-isolation、texture-profile、batch-parity、battle-batch；CPU原profile在host-profile/host.cpuprofile。未构建/安装/发布，旧dist不等于源码已更新。
