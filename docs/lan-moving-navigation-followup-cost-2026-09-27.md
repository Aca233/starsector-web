# 导航候选撤回后的成本边界（2026-09-27）

## 范围
没有新的模拟采样、性能复测或浏览器运行；没有新的生产代码/环境配置修改。复用已经保存的三舰混编完整流水线 CPU profile 和 display-v2 双客户端失败日志。原profile的740模块逐SHA与本轮撤回后的当前源码完全一致；工具输入文件SHA和会计自检保存在工件中。

## 1. 火控不是全部瓶颈，几何也不是火控的全部
原profile模拟栈共5,635,520微秒。凡祖先含 AutofireController 或 ShipWeaponControlSystem 计入火控并集，约占模拟 **31.253%**；这不包括所有舰队/舰船AI与目标查询。与单个update的30.76%是不同统计口径，不能相加。

按“准入 → 相位 → 属性 → 名单 → 几何 → 其他”的明确优先次序将火控栈样本分到互斥桶：

|火控内分类|占火控样本|占全部模拟样本|
|---|---:|---:|
|native/exact/owned准入检查|5.883%|1.839%|
|相位/无碰撞读取|7.366%|2.302%|
|武器/系统/运动属性查询|19.375%|6.055%|
|已识别几何模块|11.237%|3.512%|
|其他火控代码|56.138%|17.545%|

全部模拟中，各类函数祖先并集分别：属性查询12.785%、准入6.214%、相位6.052%、名单getter（含allSystems）6.679%、几何模块6.948%。**这些并集重叠，不可相加。** JSON同时保留完整互斥桶和top-self，脚本断言互斥桶之和等于各区域总采样。

限制：几何分类只识别显式math/geometry/NativeAim模块，遗漏内联数学，并可能包含分配、动态分派和嵌套回调；它不是纯数值耗时，更不是GPU/WASM提速上限。GC没有JS调用栈，不能硬分配给某类。profile有侵入性；以上不是CPU占用率，也不是性能收益。

## 2. 现有浏览器失败发生在计算主机
只归纳既有 display-v2 浏览器日志，不与导航候选的模拟ABBA直接比较：
- 主机在 battle-start 后 **2668.875ms** 报 worker-runtime failure；既有页面结果为“计算主机持续过载或暂停过久，恢复失败”。
- authority tick14首次被采样时，simulation均值112.183ms，lastStep102.005ms，maxStep168.335ms；capture18.687ms、encode8.099ms。
- 最后报告的authority tick32在失败事件之后才被观察到：simulation均值33.263ms、lastStep36.040ms、maxStep56.335ms，backlog374.48ms，capture18.827ms、encode9.916ms。它不是失败后恢复运行的证据。
- 两个不同authority tick报告中的preflightSkips/skipped均为0，socketBufferedBytes为0；sharedCredit开启。没有证据支持把这次停顿主要归咎于“信用窗口卡住没发包”，但不能据此排除所有网络/调度成本。
- 后续HUD反复保留tick26、Hz0。hudFresh=true只表示新HUD上报，不能把它当模拟tick在推进。没有稳态输入P95、Hz/FPS改善证据。

## 3. 下一方向约束
不重开已失败的每次查询缓存、资格租约、数组池或相同导航索引。当前较值得研究的是改变受控Worker内部的**数据读取组织**：在已经证明安全的读区间一次读取必要标量，批量计算，再按原顺序提交；而非给现有对象调用链套更多Map/索引。是否能减少总工作量仍待实现与完整配对证明，不能承诺加速比例。

若未来扩展到多核或GPU，必须连同输入整理、状态同步、输出合并、等待和原顺序提交一起计时。GPU普通Float32不能冒充现有双精度等价路径。未知访问器/动态写者/回调仍须原路径回退，不删权威或接收校验；Hz、实体数、玩法精度、画质及过载保护均不变。

工件：artifacts/lan-moving-navigation-20260927/analyze-followup-cost.mjs、followup-cost.json、analyze-prior-browser.mjs、followup-browser-evidence.json。两脚本仅读取已有证据并写新工件，没有启动测试服务或占用桌面。
