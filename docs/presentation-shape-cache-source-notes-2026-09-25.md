# 显示编码形状签名复用：编码前对照（2026-09-25）

上一目标回合是实质进展：导航候选索引已保留并通过真实200舰对照，整体优化仍active。重新读取AGENTS和当前源码；没有子代理、可见窗口或OS键鼠。

## 证据与预期

当前CombatPresentationEncoder与上一轮profiler所用源码hash完全相同。`captureGraph`在200舰/120测量tick的采样中self约833.4ms、inclusive1921.5ms，GC1157.5ms；仅用于选热点，不能相加或作为单帧性能。上一轮最终无profiler编码均值21.389ms。

当前每个变化对象即使属性名单长期不变，仍重复`type + ':' + JSON.stringify(keys)`；很多挂点/投影对象共用相同形状。每帧Object.keys、字段读取、标量比较、类型/预算校验本身不能省略。本轮只复用已验证属性名单对应的字符串签名，不缓存任何值或跳过字段读取。

这是Web内部display-only协议。原版没有对应Worker图编码器；语义基准为当前encoder/decoder及冻结字节包。重新读取本机0.98a-RC8 settings.json:8–9的vsync/60fps和CombatEntityAPI.java:16–20的位置/速度/朝向；不改这些行为，不作原版实机/UI等价声明。

## 实现边界

- snapshot可持有私有shape描述符，命中须当前完整键序列与type匹配；Object.keys、forbidden校验、getter读取及变化判断继续原序执行。签名仅在原本需要写变化Object时使用。
- 描述符keys与返回packet.shapes.keys分离，不能因为消费者修改旧包就污染签名缓存。少量重复描述符可intern，缓存表有512项上限；淘汰不影响wire语义，不限制舰船/实体/字段数量。仍存活snapshot所引用的描述符随其生命周期存在。
- 原生Object.keys/JSON.stringify识别只用于纯派生优化。替换JSON.stringify、Array/Object继承toJSON、非原生Object.keys路径回退原计算；不能缓存外部回调结果或改变receiver。原型/禁用属性/预算/失败epoch规则保留。
- BFS身份、removed顺序、strings/shapes首次出现顺序、metadata及visuals/数值区必须与冻结前逐包完全一致；不改协议、精度、频率、类型门槛或接收校验。

## 集中验收

已用既有benchmark-real-workers的build-only冻结301模块图，并保存原encoder。在既有render-projection扩展形状合同：键增删/重排/数字与Unicode键、共享形状、shape返回值修改、getter动态变更、同tick、失败隔离、缓存淘汰、UI通路、JSON/toJSON/Object.keys自定义回退及完整包对照。一次类型/改动lint/该既有场景后，用同一真实Worker200舰、150预热+180测量、逐tick交替配对，核对全显示/权威/隐藏RNG。无净收益则撤回，不靠少序列化几次就宣称提速。保留WIP与0.2.11，不提交/打包/发布。

## 实现补充与首次验收反馈

在读取字段前还验证原生Array.some与Symbol.iterator的数据描述符，且导入时验证捕获的迭代器/方法为原生；避免自定义遍历拿到keys数组并在恢复原型后留下toJSON等钩子时误用缓存。不是以此构建同realm恶意代码沙箱；原先的类型、禁用字段与失败epoch校验仍独立执行。

集中类型检查、4个改动文件oxlint均通过。全render-projection执行到新增helper时，UI decoder正确拒绝了测试写错的根封装（bare graph不符合lan-presentation-ui五字段根约束）；修复测试为每帧新封装，未改生产校验，随后仅定向复查新增helper。491断言、232包/116组新旧有效字节对照通过；另加入真实HUD、战术图、部署projector的8帧UI协议检查。合成图不是完整UI功能验收，未验证渲染或用户交互。失败原始日志与修复日志均保留。

真实Worker对照前已冻结301模块候选，只有encoder一个生产模块改变，另300个模块与本轮baseline逐hash一致。

## 最终决定

真实200舰测试编码均值−2.43%，但交付均值仅−0.47%，六个连续区间中三个略慢；不认为它建立了稳定的整体收益。已按hash核对并仅恢复本轮encoder，301个最终模块与baseline完全相同；新增回归测试保留。详见同日performance文档及acceptance.json，不能把已撤回候选的数字描述为当前代码提速。
