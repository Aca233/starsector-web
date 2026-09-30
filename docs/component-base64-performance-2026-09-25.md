# 组件 base64 接收优化结果（2026-09-25）

## 结论
**保留生产改动，已有明确的组件接收耗时收益。** 四条既有路径（motion、关键combat、projectile-visual包、authority组件上传接收）共用 `decodeBase64Bytes`。浏览器有原生 `Uint8Array.fromBase64` 时直接产生字节；旧环境用 `atob` 加索引循环，不再走 `Uint8Array.from` 的通用迭代/逐字符回调。

这不是整场战斗提速百分比：完整 SWB1 大快照恢复、模拟/火控、实际网络 RTT、RAF FPS 和 input-to-photon 均未在本轮测量。默认主线程/Worker 策略不变；combat/visual 仍按原功能策略协商，不因本改动自动启用。没有 GPU compute，也没有新增线程或对象池。

## 正确性与边界
实现前证据见 `component-base64-source-notes-2026-09-25.md`。原版0.98a-RC8配置及CombatEntityAPI只用于核对本轮不能改变的模拟属性；没有新原版实机/UI截图或交互核验，不声称原版网络/UI等价。

- 所有调用者原有类型、编码长度、alphabet、解码后长度、fragment顺序、字段/schema、UTF-8及CRC检查继续执行。
- 原生解码保持默认loose尾块处理，保留原atob对未使用padding位的接受规则；不悄悄切换strict。
- 每次返回独立buffer，不共享可变scratch，不缓存payload，不更改编码输出或浮点精度。运动/战斗/特效数量、权威规则与频率不变。
- 原生分支验证确实命中4个生产调用者，计数为4次原生解码、0次atob。旧环境仍有binary string，但省去通用逐字符映射。

验证结果：
- **892次**字节/解码值/错误接受集对照通过，另包含显式边界和所有权断言；不能将它说成892个独立完整游戏场景。
- **120次**真实恢复world的运动姿态与combat/武器值比较通过（12个捕获点 × 5个时间偏移 × native/fallback）。运动不改权威位置，clear后无残留姿态。
- 覆盖全部byte值、不同尾块/padding、-0及极小/大合法数字、Unicode舰船ID、非法UTF8/tick、完整SCC1/SCC2、错误alphabet/编码和解码上限、实际20KB视觉基线分片、坏CRC、失败后有效baseline恢复、独立buffer。
- Node v24.13.1实际没有fromBase64：另核对48个实际组件输入的fallback字节与Buffer参考完全相同。此Node检查不是Node性能跑分。
- 浏览器错误0，冻结图类型比较before 0 / after 0 / 新增0；相关lint、scoped diff-check及尾空白检查通过。

## 测量方法
扩展既有 `check-battle-batching-browser.mjs` 的Offscreen场景，以独立 `OFFSCREEN_BASE64_CHECK` 分支运行。只执行这一相关场景一次，没有失败后追加多轮挑选数字；浏览器/临时服务器已关闭。类型检查先结束，再进行计时，没有并行跑本任务的其它重CPU测试。

使用原有22舰夹具、seed917、600次1/60预热，取tick600–611共12个生产捕获。每包数据：
- Motion：1361 bytes、22舰。
- SCC1：2715 bytes、22舰。
- SCC2：32524 bytes、22舰完整武器状态。本次未触发测试预案中的4舰缩小fallback。
- Projectile：173–176枚；一个20191 bytes基线，之后11个2768–5729 bytes更新。视觉接收列表没有每帧重复发送baseline来放大收益。

旧入口由冻结源码加载，只有4个改动入口有独立旧模块，未改依赖共享同一个冻结类图。当前完整源图仅4个生产文件修改、2个辅助文件新增；没有通过不同模拟类图或精度换收益。

同一无头Chromium中，native/fallback各自对5个工作负载做12次预热，然后6轮交替ABBA/BAAB；每个时段24遍同样的输入。每臂每负载12个计时时段，全部保留。时间由performance.now测得，含同步工作中的GC/调度影响；没有profiler或强制GC。每个计时时段的witness也检查一致。

**下表单位是“整组输入一遍”的毫秒，不是每帧或单包延迟。** 前4行每遍12包，第5行每遍24条发布（12条SCC2 + 12条视觉发布），第五行包含真实校验、CRC及状态保留，不能与其它行相加。

### 浏览器原生解码
| 接收工作 | 旧均值 ms/组 | 新均值 ms/组 | 变化 |
|---|---:|---:|---:|
| Motion完整解码 | 0.763 | 0.111 | −85.43% |
| SCC1完整解码 | 1.481 | 0.177 | −88.06% |
| SCC2完整解码（含武器） | 17.581 | 2.327 | −86.76% |
| 视觉包字节/信封验证 | 3.108 | 0.382 | −87.72% |
| Authority组件发布接收/校验/保留 | 54.592 | 36.934 | −32.35% |

### 同一浏览器强制缺少原生能力
| 接收工作 | 旧均值 ms/组 | 新fallback均值 ms/组 | 变化 |
|---|---:|---:|---:|
| Motion完整解码 | 0.748 | 0.138 | −81.57% |
| SCC1完整解码 | 1.419 | 0.226 | −84.04% |
| SCC2完整解码 | 17.372 | 2.913 | −83.23% |
| 视觉包字节/信封验证 | 3.094 | 0.503 | −83.76% |
| Authority组件发布接收/校验/保留 | 55.916 | 40.336 | −27.86% |

分位数及每段原始时间在JSON中；其P95是“每段24遍的平均耗时”的分位数，不是单帧/单包P95。只有一次同机固定夹具实验，不宣称跨硬件/所有模组的普适百分比或统计显著性。原生组与fallback组不要互相混成同一ABBA实验。

## 冻结与报告审计
工件：`artifacts/component-base64-20260925/`
- `before-browser.json`：664个非生涯模块；`current-browser.json`：666个。
- 660个已有模块在候选中未改；结束时该范围额外工作区漂移0。仓库仍有此前及生涯WIP，未据此声称工作区洁净。
- `source-changes.json`、`scoped-source.patch`、`typecheck-comparison.json`、`acceptance.json`及lint/diff日志。
- `offscreen/component-fixtures.json`：实际输入，可核对对应SHA-256；`offscreen/offscreen-result.json`：完整检查、配对时间、fixture尺寸。
- 场景通用顶层scope标签原本提及Worker/WebGL，不适合此早返回分支。跑完只修正此报告标签，没有重跑、改变任何数值或检查；原始报告保存在 `offscreen-result.raw.json`，执行时脚本及前后哈希也保留。实际未执行GPU像素或Worker性能比较。
- 最初考虑的241帧motion-display历史fixture已不在当前工作区，因此在测试启动前改用现存自生成Offscreen夹具；没有宣称旧241帧场景已运行。

复现核心环境：`OFFSCREEN_RECEIVER_CHECK=true`、`OFFSCREEN_BASE64_CHECK=true`，BASELINE/CURRENT指向本目录两个冻结图；`BATCH_TEST_OUT`指向输出目录；沿用既有NODE_PATH，运行 `node scripts/check-battle-batching-browser.mjs`。无需修改.env、组件开关或项目默认策略。

版本仍为0.2.11，未暂存/提交/推送/打包/发布/替换安装版；未使用子代理、可见窗口或键鼠操作。大规模模拟与完整快照恢复仍是后续独立优化目标。
