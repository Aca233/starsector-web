# 火控扫描临时记录复用：性能与验收（2026-09-25）

## 结论
保留本轮生产改动。在当前已包含此前编码器/解码器优化的工作树上，200 Onslaught真实Worker配对中，模拟均值54.144→51.917ms（-4.11%）、模拟P95 62.295→60.680ms（-2.59%）。

最终Worker往返加主线程解码均值只下降0.57%，P95下降0.84%；编码/解码均值出现反向波动。**这不是整体交互延迟降低4.11%的证据。** 只有一轮固定场景配对，未证明跨机器、混编、模组或多次独立重复下的收益。大规模60Hz目标仍未解决。

## 为什么选此处
新鲜CPU采样：真实生产local Worker、200舰、150步预热+90步采样；模拟栈4401.8ms，武器控制1966.8ms（44.7%），preAim998.9ms（22.7%），canTarget535.0ms。这些包含时间不能相加。GC1112.9ms覆盖整个被采样Worker，不能全归因于模拟，更不能全归因于本轮包装记录。

本次profile仅定位，绝不拿其绝对时长和无profiler验收比较成加速比例。保留 `profile/serial.cpuprofile`、`profile-summary.json` 及当时完整源码图。

## 保留内容
只修改生产 `src/engine/ai/AutofireController.ts`：
- preAim的一次调用内惰性创建一个SHIP探测记录；下次track复用。对外只返回point，记录不跨调用、不写入tracker。
- aim扫描中SHIP和MISSILE各有一个局部探测记录。canTarget拒绝/solve返回null时才复用；成功solution加入候选后立即放弃复用该记录，后续候选必须新建。
- 现有current target不作为scratch；已接受的candidate、已返回solution、tracker持有的target始终拥有独立稳定的记录。
- 局部变量隔离重入调用和异常；无全局或跨tick对象池，无动态状态缓存。

全部阵营、可见性、相位、角色、范围、拦截、射界、碰撞、友军和障碍检查继续逐候选执行。名单/读取/回调/排序/RNG顺序不变，没有候选剪枝、降频、减实体、减特效、精度变化。没有复活被否决的batch资格修正/范围树，没有新增GPU compute。

来源与修改前安全边界见 `docs/fire-target-record-source-notes-2026-09-25.md`。原版仅作机制边界依据；没有原版/Web桌面或视觉验收，不宣称新增玩法还原完成。

## 验证
集中一次TypeScript检查、三个改动代码文件lint和既有check-combat-ai场景，全部退出0；40项场景通过，无失败或重跑。

新增两组合同：
1. 成功/拒绝目标交错，多舰与舰船/导弹混扫；跨后续扫描保留已返回的记录/实体身份；动态位置getter和可见性方法的调用序列、完整solution、mount fireControl及tracker/RNG快照与旧版相等。
2. preAim内可见性读取重入同一个controller的另一挂点aim/preAim；两世界位置不同，独立临时记录不被覆盖；活读取抛错后新调用正确恢复，隐藏状态仍被即时观察。

`load-combat-lab.mjs`新增可选 `autofireBaseline`，只为测试将冻结旧AutofireController导入同一Ship/Vector2模块图。已检查实际合同bundle导出独立的AutofireController2为BeforeAutofireController，两组对照不是误用同一个类。默认调用不引入旧实现。

## 无profiler的200舰验收
独立无头Edge153，16逻辑CPU，cross-origin isolated；真实生产local Worker、嵌套owner Worker以及生产主线程decoder。seed917、固定dt=1/60、150步预热+180步测量；旧串行参考/旧默认/新默认逐tick交替运行，不同时驱动。

双方默认均在tick49退出亏损多核，测量窗口freshBatches=0，模拟成本门完全未改。不是通过将旧版多核开销留在测量窗口中人为制造优势。

| 指标 | 修改前均值 | 修改后均值 | 均值变化 | 修改前P95 | 修改后P95 | P95变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 模拟 | 54.144ms | 51.917ms | -4.11% | 62.295ms | 60.680ms | -2.59% |
| Worker往返 | 75.974ms | 75.034ms | -1.24% | 88.225ms | 87.695ms | -0.60% |
| Worker往返+解码 | 86.160ms | 85.671ms | -0.57% | 98.725ms | 97.895ms | -0.84% |
| 编码 | 21.424ms | 22.708ms | +5.99% | 29.875ms | 28.520ms | -4.54% |
| 主线程解码 | 10.186ms | 10.637ms | +4.42% | 14.290ms | 14.270ms | -0.14% |

编码与解码源码完全相同，不能把波动断言为算法回归，也不能隐藏它们只展示模拟加速。未单独测定GC归因/分配数或CPU占用率。deliveredMs仅Worker往返加apply，不含渲染/显示等待，不是网络RTT、实际FPS或输入到屏幕延迟。

330tick对应660次有效数据包、witness、声音、回执和胜负比较；包括init的662次完整显示图/别名对照；11检查点×2组的22次完整权威二进制/隐藏火控目标与RNG对照，全部一致。

## 源码与保留边界
baseline/candidate各298模块，仅AutofireController.ts不同，新增/缺失模块均0；最终文件与候选源图无漂移。此前已验收的编码器、解码器和联机预检保留不动，其它任务未完成生涯改动不碰。

本轮只有三个代码文件、两份文档及本地测量工件；未暂存、提交、推送、发布打包或替换安装。没有子代理、可见窗口或键鼠注入。自己的无头Worker/浏览器/临时服务器均随基准结束关闭。

工件目录 `artifacts/simulation-hotspot-20260925/`：修改前文件、完整baseline/candidate源图、profile及summary、检查日志/check-status、target-record-200/result.json、benchmark-status、graph-comparison、measurement-summary、acceptance。

下一步仍需减少模拟热区的重复工作和持续分配；本轮约51.9ms的模拟仍超16.67ms预算约3.1倍，整体优化目标继续未完成。
