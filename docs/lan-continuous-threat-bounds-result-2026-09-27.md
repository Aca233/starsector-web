# 纯读包络内持续武器粗筛：否决并撤回（2026-09-27）

## 裁决
唯一ABBA两组节省1.3096% / 16.7739%，第一组未达事前各省5%的门槛，passesPrescribedGate=false。exit=0只是测试执行完成，不能认定通过。不重复择优、不更改门槛；本轮没有新增有效提速交付，不启动浏览器、不默认启用、不提交/推送/打包/发布。

## 候选与验证
唯一生产写集src/engine/ai/ThreatAssessment.ts：默认关闭VITE_AI_CONTINUOUS_THREAT_BOUNDS；只有本敌源已经取得现有纯读envelope，才保留既有assessment-local范围粗筛。原公式不变、false不恢复true、未知回调仍关闭。没有新索引、资格重审、状态缓存、实体/精度/Hz/保护阈值修改。

冻结当前740个非campaign模块；不是沿用早期739或726基底。一次typecheck/lint退出0；一次集中五行为组全部通过，无修复重跑：
- 真实host init/reinit/default：176实体734挂点，四已有实验两臂相同，default不保留新粗筛。
- 12种horizon/位置场景×exact/无包络/close/invalidated，1056次逐舰有序预测相等，527次非空预测；包含NaN/Infinity/负值/0/极大坐标。
- 未知护盾回调：变更敌舰位置、重入、抛错；调用分别400/400/1次，顺序/结果/异常相同，延续计数0。
- 60完整fixedUpdate，tick8技能+flux20%、tick20近距、tick30排散、tick38模块低血封舱扰动，逐步authority+隐藏tracker/RNG相同。
- 非计时自然270步：20与270完整状态相同，初始176、末171活跃实体。

20步SHA：bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
270步SHA：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。

## 工作量，不是速度
热身150步后的120步，几何精算入口566418→547017，减少3.4252%；实际后续挂点提前拒绝19401次；新保留粗筛路径397242次。全部270步新增提前拒绝37281次。此口径不是火控全部计算量或CPU占用率，没有profile证明候选慢/快的具体原因，不能把被省次数等比例推成性能。

## 唯一完整无插桩ABBA
2玩家+20AI，web_zhuyuan/web_gloriana/web_sc2_hyperion循环，seed917，3200DP。每臂独立隐藏Node进程，150热身+120完整fixedUpdate(1/60)，计时不含spawn/import/热身/末尾见证。

|臂|120步ms|每步ms|
|---|---:|---:|
|A0|4127.1776|34.3931|
|B1|4073.1275|33.9427|
|B2|4510.8604|37.5905|
|A3|5420.0089|45.1667|

四臂完整终态同SHA。两个配对差异很大，不根据较好的一组宣称稳定收益；不将Node时钟当作浏览器Hz或输入P95。本轮无真实浏览器/原版实机验收。

## 撤回核验
全一文件写集在恢复前核对解析绝对路径、当前candidate SHA和before SHA，归档rejected-source后仅恢复该文件。本次740模块没有观察到同期源变更，恢复后逐模块等于pre-revert图只替换该文件的预期；before字节及此前所有工作完整保留。工件revert-preflight.json、revert-verification.json、after-revert-browser.json。测试脚本继续通过冻结candidate图重放历史候选，无需恢复生产。

本轮排除的是这项持续粗筛，不是否定火控优化；不要复测或围绕它调小分支。已有采样和本次计数提示应先评估更大粒度的重复工作，而非继续只省少量几何求交。所有测试进程已结束，无服务/浏览器遗留。

工件根：artifacts/lan-continuous-threat-bounds-20260927；合同scripts/check-lan-continuous-threat-bounds.mjs。
