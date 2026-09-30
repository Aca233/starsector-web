# 当前混编 display-v2 完整链路预登记（2026-09-27）

## 证据 → 边界
- 原版 0.98a-RC8：../decompiled/starfarer_api_source/com/fs/starfarer/api/loading/WeaponSpecAPI.java 存在定义 setter（39、55 等行）。不能以根对象身份假设定义永远不变。只读来源；原版实机/视觉未验。
- 当前 HostSnapshot.ts 的 VITE_LAN_DISPLAY_DEFINITIONS 默认关闭。每帧自包含内容表；mutable root 每次枚举/descriptor/value 审核，动态 range/speed 独立；接收绑定根不可按相同内容共享。
- 历史 64 舰不代表当前 176 实体/734 挂点。上轮模板候选失败已撤回，不在本次写集。
- BinarySnapshot.mjs:275 encodeNumber 把安全整数 -0 写为 0；默认 MessagePack/JSON 的对照由本次数值合同实测。未先入为主改协议。

## 候选与写集
本次只评估现存 v2 的开关，不先修改任何生产文件、默认设置或环境文件。A 为 display-v1，B 为现有 display-v2；冻结相同 src 非 campaign 图及 build 依赖。新增文件仅本工件目录、本 source-notes 与结果文档。旧完整 native-capture suite 的退休 orion_device 导入故障仍未修复；抽取既有六个 v2 合同，仅将旧舰 fixture 换为当前 authored 舰，不宣称全套通过。

## 正确性先行
- 原既有六项：完整显示/HUD/纹理集合；定义动态编辑、fallback/回表/跳帧/冷重连/v1-v2切换；挂点身份及动态射程弹速；访问器不执行、暖缓存每字段重新采样；恶意数据/预算在显示修改前拒绝；binary/tape/relay/delta。
- 相同 seed917、2玩家+20AI、三舰 web_zhuyuan/web_gloriana/web_sc2_hyperion、3200DP。沿用四项已存在模拟实验，A/B相同。
- 60步既定扰动：每步比较 authority capture +所有 RNG/autofire tracker；wire预期不同，不要求相等；比较完整接收可观察值（允许既有v2声明的只读定义子树共享/flags差异），另查逐挂点动态range/speed、HUD、纹理集合。保留值与引用身份合同，不把任意别名差异视为无关。

## 唯一无插桩性能对照（事前固定）
正确性全部通过后，独立隐藏 Node 进程 A0/B1/B2/A3；每臂150完整流水线热身+120步测量。不使用 profiler，不择优复测。
- 五段 simulation+capture+encode+decode+apply 两组均值各至少节省5%。
- decode+apply 两组各至少节省10%。
- authority simulation+capture+encode 每组回退不超过3%。
- 20、270步完整权威SHA必须匹配既定基线；接收可观察值A/B一致；同格式重复臂wire必须一致；读取资产SHA一致。
- 未达任一条即不晋升默认、不浏览器测试，不事后降低门槛。
- 通过才运行一次既有双无头浏览器功能验收；离线结果不等于浏览器Hz/操作P95/实际网络延迟改善。
