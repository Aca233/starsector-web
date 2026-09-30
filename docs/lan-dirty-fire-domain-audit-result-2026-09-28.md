# 火控依赖组增量审核：270步只读对照结果（2026-09-28）

## 结论及下一决策
取得支持一个**尚未实现的新结构方案**的证据，而非新增生产提速。过去的自定义舰查询复用候选在每舰瞄准前重审全舰队；本次影子实现按native writer的parent/sourceCarrier依赖组标脏，在同样的查询入口重审脏组，初始全查一次。270步中 **3,682,614行**逐行与完整实时oracle比较，strict/data两种判断都没有不一致；20/270步完整authority+隐藏autofire/RNG与未插桩基底完全相同。

下一实施应采用**依赖组增量资格 + 现有发射前短事务**，不是旧候选的原样恢复，不把cache延长到发射、战机推进或伤害结算。**无需放宽runtime资格**：本自然负载里strict拒绝非空runtime的规则已经覆盖100%，data-only假设没有额外覆盖，应删除这个不必要的扩展计划，继续拒绝非空runtime和未知回调。

## 当前来源及不变项
固定Node v24.13.0/C:/Program Files/nodejs/node.exe；先核对当前776源码、依赖和3489资源与上一ABBA的真正before arm逐SHA相同，才复用那个未改动bundle。重新记录当前源图SHA 34c69921c4b87aacb2ffeff0d8fc4f9e670893e59263cd1847598b5145c7c629。only artifact插桩保留类方法捕获身份；不改变真实查询返回值、不启用任何既有默认关闭实验、不运行性能ABBA或浏览器。生产文件未改，当前776模块全部仍与本轮冻结图相同。

真实host init：2玩家+20AI，三舰循环、seed917/3200DP，初始176实体734挂点；自然270步，末态171实体。

## 观察量（不是速度）
|窗口|事务查询入口|完整oracle行数|阶段初查行数|脏组重查行数|初查+重查相对全查减少|
|---|---:|---:|---:|---:|---:|
|cold150|11700|2059200|26400|242550|86.9391%|
|warm120|9360|1623414|20813|190970|86.9545%|

**重要分母限制**：完整oracle是本次额外构造的只读对照，模拟此前已否决候选的全舰队重审方式；当前默认游戏并不执行这些自定义舰批处理审核。不能声称“已消掉默认路径1623414次检查”或游戏提速86.95%。实测程序同时执行了完整与增量检查，根本不是加速版本。

21060个phase内入口全部通过strict纯读资格，均未因unknown writer/关系/名单改变关闭。冷期每阶段为15个单成员组和7个23成员组；热期随自然实体退出，部分组变为20–22。其它26148个战机/轰炸机等scope外火控入口未纳入候选，不借这个结果扩大到它们。

20步SHA bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。
270步SHA bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。

## 接入前仍必须证明的边界
- 实际只在私有data-command Worker，原生Engine/updateShipAI/模块AI/部署导航与查询读者身份通过审核时开启。非owned、任意外来world或原型/实例覆盖保留原串行查询。
- 初始完整读者审核，当前writer在AI/本舰update之前必须仍满足本地写域。未知writer立即关闭整个区间；不能在未知代码执行后沿用正缓存。before与after都标脏，保证瞄准后发射/消耗产生的变更对后舰可见。
- parent/carrier关系、同长名单替换/重排、budget回调、重入/重复begin及异常finally清理要明确拒绝。尤其不能只沿用旧budget的estimate/penalty身份而漏掉needsDetailedPenalty或canOmitUncontestedPenalty getter。
- 新增read定义权限独立于AI/stats权限，仅覆盖已审计注册定义；未核实Adun或未来扩展不得因same ID/native-stat许可隐式晋升。旧native gate、compactForecast、射程/几何和发射顺序保持。
- 资格缓存不等于目标状态缓存。真正目标/挡线列表仍在motion/repair之后新建、发射之前关闭；不得跨舰复用位置、相位、可见性、存亡或命中结果。
- 此轮没有扰动/未知扩展异常合同，也没有新性能或端到端结论；实施后集中类型/lint、完整状态与上述边界合同，只有通过后做一次新候选完整ABBA。未定义它为已落地优化。

## 工件
artifacts/lan-dirty-fire-domain-audit-20260928/{input-manifest.json,frozen-browser.json,observed.mjs,observe.mjs,result.json,observe.log}。唯一观察进程已正常退出，无生产修改需要回滚。
