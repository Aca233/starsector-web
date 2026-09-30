# LAN motion/combat 呈现消费：实现前记录（2026-09-25）

## 原版证据及范围
已查看本机0.98a-RC8 `../starsector-core/data/config/settings.json:8-12`（60fps/vsync）以及 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16-20,48`（位置、速度、朝向、生命值读取）。本轮不改这些模拟属性的权威计算，不改wire精度/频率、界面或资源；只移动Web接收及回执所有权。无原版实机/新截图证据，不声称原版网络等价。

## 当前差异 → 预期
LanBattle.acceptMotion在MotionReplica.receive之前发送motion-consumed；combat手工确认也散在组件回调里，不能直接复用Worker延迟消费。服务器motion窗口最多16项且ACK是累计；combat最多6项且ACK是精确tick。现在的PresentationReceipts只覆盖state/visual。

增加独立motion/combat消费账本，与现有state/visual不互相挡ACK；终局必须等待所有lane实际完成。连接层最多解码base64前16字符读取12字节头，绑定本地tick/syncId，完整帧验证与保留仍在实际Runtime；Worker不得自行选择服务器回执身份。main-default与本地主机motion使用同一Runtime接收方法。过期但合法的帧可消费但不提升显示tick/Hz；inactive运动不会授予服务器active信用，combat仍可明确discard。

扩展现有可选binary-owner能力承接motion/combat字符串原包，复用显式owner/epoch和launch syncId，不默认启用Worker。字符串消息仍有小包复制，不宣称zero-copy。visual、本地主机大快照、全量输入音频/Canvas回退和跨代际ready约束不冒充本轮完成。

## 验证
冻结非生涯源码，保留所有无关WIP。一次集中typecheck/scoped lint和既有Offscreen场景的motion/combat分支：实际连接/Socket/Worker、普通同步Runtime对照、独立lane乱序完成、过期sync/epoch、无效帧、暂停/恢复、终局、上限及无提前ACK。只针对具体失败复查；不运行广泛性能全套、不注入键鼠、不使用子代理、不提交发布。无配对延迟测量就不报告提速。

## 实现后记录
本轮已完成上述有限范围。27 项定向检查及冻结图类型对照通过；复查补上组件先于首个快照时撤销 owner 的额度恢复。结果、测试夹具修复与未完成边界见同目录 lan-presentation-components-validation-2026-09-25.md，不据此声称已提速或完整 Worker 默认上线。
