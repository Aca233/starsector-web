# 武器投影变更日志：修改前对照（2026-09-26）

## 证据与范围

上一轮角色mask已否决并逐字回退，当前320模块与该轮baseline一致。重新读取本机0.98a-RC8 WeaponAPI.java:158当前角度、185位置、262规格接口；本轮只改变Web显示序列化内部重复工作，不改原版玩法、画面字段、更新频率、精度、实体或真实校验，原版实机/截图未操作。

现有保存的200舰CPU诊断：captureGraph及value链累计约775ms/60tick，属于显示编码主要成本。RenderShipProjection.weapon已逐字段读取源挂点并写私有输出；随后captureGraph再次读全部输出字段、类型分派并逐tag/payload比较。只缓存keys/改scalar写法/字典登记均已试过失败；本候选不是它们，而是把已有投影写入阶段的变更信息送给图编码，跳过已证明不变的**原始值重新编码**。

## 候选约束

仅封闭Worker Encoder内部自有ProjectedRenderWeapon输出记录可有journal，普通Projector、UI、外来同原型记录、组件/数组/Map/Vector和Ship/System均维持通用路径。投影仍每次读取所有原字段，Object.is对比上次输出并记录13位dirty mask；同一次发布重复访问取OR上界，首次/退休重入/未连续跟踪一律全dirty。无需seal/freeze或全局对象池。

编码仍执行Object.keys、原型/模拟类型/非法key/类型/预算检查。仅在上一有效snapshot的种类/类型/字段顺序/长度与当前schema都匹配时，才能跳过未dirty且上次tag为原始值的字段。所有Ref/Metadata边每帧仍按原字段顺序访问：不得因父引用未变而丢掉子对象更新、别名、BFS身份次序、元数据存活或预算。dirty字段仍走原value/scalar比较与ObjectPatch写入，mask是保守提示，不是无条件发出差分。

Object.keys不缓存，packet.shapes.keys仍为外部可变数组；key变更、历史包key修改、未知结构及无previous情况全走原路径。跳过值分派后at仍为完整字段数*2，不能把少调用当成减少live数据预算。Wire/Decoder及协议15均不改，预期每份有效包字节完全一致。

## 所有权/失效

RenderShipProjection.begin仅由当前封闭Worker capture传入跟踪许可，finish结束可用期并更新连续发布token。journal不持有源Ship/挂点，不外泄到包，使用弱键；跨普通capture/未finish/缺席发布不得把旧mask当新证明。闭合域来自已存在数据命令Worker约定，不是同realm恶意代码沙箱；开放可执行插件前须重新审计。不是缓存动态游戏结果。

## 验证与先验门槛

扩展既有render-projection同realm旧Encoder逐包对照，覆盖private/public切换、所有标量/NaN/±0/undefined、嵌套引用原地修改、替换/别名、武器重排/重复/退出重入、metadata变化、外来同原型动态字段、历史shape.keys和非法字段值/失败粘性。测试构建数value调用及journal触达；正式测速不插桩。

完成后一轮typecheck/改动lint/既有场景，仅具体失败定向修复。性能预设两次角色互换真实Host测试，每次200舰150预热180测量，六排列平衡；使用serial/before同码独立实例控制，旧新各三个实例全部汇总。目标编码均值至少−8%、交付至少−3%，并各超过同码控制差异1个百分点，两次角色配对方向一致且交付P95不增加。完整门槛见performance-gate.json；不拿未改模拟波动作收益，不择优重测，未通过按SHA精确回退。
