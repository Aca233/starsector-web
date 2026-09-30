# 显示元数据校验热路径：修改前依据（2026-09-25）

## 来源与范围
当前完整双人22舰profile的主线程`LanDisplaySnapshot.restore`包含约3.5–3.7s采样，`DisplayDefinition.visit` self约651–730ms（SwiftShader+profiler，仅定位、不当真实GPU延迟）。默认v1每次对每个武器/system的可变显示定义进行完整数据校验；已有v2表默认关闭，不能为接收收益忽略权威捕获尾部回退或可变数据兼容性。

本轮仅修改Web协议数据校验算法，不修改原版玩法/UI、传输格式、频率、字段、元数据可变性或资产授权。原版无此网络接收安全层；原版实机界面不在本轮验证范围。以现行DisplayDefinition.ts实现作冻结行为基线，不能将优化当成原版等价证明。

## 当前重复工作与方案
现行visit递归同时处理容器与标量；大量数字/字符串/布尔/undefined叶子进入同一个含递归和枚举的大函数。在保留每次descriptor、每个节点预算计数和资产检查的前提下，将标量检查提取为可内联的非递归helper，容器才递归。不是基于身份或已冻结标记跳过校验，不跨调用缓存，不降低200000节点/32深度/65536字符串预算。

保持DFS字段读取顺序、节点计数（含null/undefined/数组空洞的原行为）、所有错误分类、原型/访问器/方法/禁止字段/资源白名单检查、可变对象每次重新检查。每次调用仍私有预算，不受Proxy陷阱触发的重入影响。

## 验证与决策
扩展既有check-native-capture用独立旧/新validator而共享AssetManager，覆盖原子值、普通/空原型/数组/特殊对象、代理descriptor顺序/读取时变动、重入、边界预算与资源路径，再跑既有display-v2非法内容/恢复场景。最终集中typecheck、修改文件lint、相关现有测试。

使用现有build-authority-cpu-probe冻结当前before，再仅覆盖validator构建after；64舰（2 Onslaught+62 Hammerhead）实际LAN capture/binary/decode/apply全流水线ABBA，240预热+240测量。比较完整wire及接收对象图摘要、所有阶段均值/P95；不能只用validator微基准。没有实际收益则撤回生产候选、保留证据；有收益再接完整无头联机确认，不注入键鼠，不开v2，不动生涯/提交/发布。

## 第一候选：已撤回
64舰ABBA各臂480测量tick：apply均值13.753→13.637ms（−0.84%），P95 16.503→16.500（无实质变化）；全流水线36.782→36.763ms（−0.05%），P95 +0.95%。全部wire/末态完整对象图摘要相同，12项正确性回归通过。性能不足以支持保留生产复杂度，DisplayDefinition.ts从本轮精确backup恢复；保留冻结候选与回归用例。

## 第二候选：属性守卫的常见自有字段路径
当前assertDataField每个字段均进入“对象→原型链”的循环。实际热帧大多是已经存在的自有data descriptor；把这一分支从原型回溯循环分离，让热调用保持单个descriptor查询，只有缺少自有字段时进入原来的原型遍历。

不缓存descriptor，不信任layout作为写权限，不省略SKIP/函数/getter/setter检查；每次guard仍读取当前descriptor。保留空/falsy target的既有行为、继承data遮蔽更高层method的规则和代理陷阱顺序，冷路径也不放行方法/访问器。目标不是降低校验，而是将罕见循环移出可内联的常见路径。

冻结CPU before保持不变，只覆盖DisplaySnapshotCodec.ts构建新候选；现有固定record/direct-projectile/full-display对象图对照改为读取冻结旧guard，再增加直接原型/描述符顺序回归。另作独立ABBA，不与第一候选混合。

## 最终决策
第二候选也撤回：apply均值−0.98%但P95+1.84%；decode+apply均值+0.09%、P95+3.58%，不支持接收延迟改善。此前已接受的优化保持不变，650个非生涯源码相对本轮before最终漂移为0。新增回归和全部测量保留，详见display-validation-performance-2026-09-25.md。下一步转向接收/渲染与主线程输入的职责分离可行性，不再继续重排这两类小循环。
