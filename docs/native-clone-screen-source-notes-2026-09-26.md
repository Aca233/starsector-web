# 原生完整图克隆：架构筛选（修改前，2026-09-26）

原版本机0.98a-RC8 CombatEntityAPI.java:8/9和WeaponAPI.java:158/185/262的实时数据接口仍是语义边界；本轮只增加headless诊断，不修改原版玩法/界面/显示字段或生产TS，没有原版实机验收。

此前FixedTimestepScheduler异步完成立即drain；point/puff分派候选已回退，不重复。现有完整Host显示成本包含JS图遍历、身份/delta编码、Worker传输、验证/恢复。structuredClone可以原生复制Map/Set/typed和别名/循环，但会丢原型、null原型和冻结状态；不是直接替换postMessage即可。

先做必要条件筛选，而非发布新协议：在真实每个200舰已解码帧上，用原生clone复制全图（含所有元数据和密集视觉数组），显式记录已审计原型，验证全图节点/边/标量/非法键/预算/声明一致性，全部通过后恢复原型与冻结状态，再与原显示图完整Object.is/别名对照。统计prepare+native clone+validate/revive总成本及各段。

这是乐观的同realm成本筛选：输入已经完成projection，没有Worker排队/IPC；不保留跨帧对象身份，不恢复Immutable私有注册品牌，不代替现有协议的ACK/replay/内容签名/事务验证，也不宣称生产等价或速度提升。如果连当前实现的这种乐观测量都不比原encode+Host呈现成本便宜，则不值得直接实现“每帧全图原生克隆”；不外推否决原生delta或元数据分离协议。若明显便宜，再实现完整身份/metadata/事务路径并正式做角色互换。

一次既有render-projection专项和lint后，仅固定一次诊断：真实Host三个相同baseline版本、balanced、200舰、warm150/steps60，每tick主serial图探测。诊断会扰动主线程与GC，原Host耗时只是同期参考，不当独立A/B收益。无其它并行性能实验。

注意：所谓乐观只指省略了生产集成工作，并非对所有可能的clone布局/校验算法证明数学下界。筛选仅约束本次直接全图方案。
