# 火控资格成本与不可变插件分类（2026-09-24）

## 原版证据 → 预期行为

本机 0.98a-RC8。修改前已阅读本机 starsector-core/data/hullmods/VastBulk.java:9-12（结构/引擎损伤倍率为零）、IntegratedTargetingUnit.java:31-40（创建前按舰级安装弹道/能量射程加成），以及 decompiled/starfarer_obf/com/fs/starfarer/combat/systems/WeaponGroup.java:301-314（逐武器推进 AI 后独立判定开火）。本轮不修改插件效果、目标合法性、射程算式、武器推进次序、频率、伤害或 UI；优化 Web 对固定元数据的重复分类。源码证据不代表原版实机/视觉验证，未操作桌面。

## 新剖析修正了上一轮假设

复用上一轮冻结的生产/仅资格修正百舰 Onslaught 构建，各预热 100 步、采样 180 步。原路径模拟栈采样约 4378ms；激活 batch 后约 5043ms，其中 hasNativeQueryLoop 累计约 426ms、hasNativeFireControlReaders 约 651ms（包含前者），begin 约 231ms。逐武器可变描述符反射比重扫名单更贵；这些重叠样本不能相加，也不是非 profiler 性能结果。不能只优化 begin 后就假定能抵消资格修正成本。

## 有界候选与安全边界（编码前）

1. 保持 ArmorGrid 原有资格回退，不复活被否决的预瞄树、不修改 FireControlQueryRoster。所有动态/回调审计继续执行。
2. HullMods 已对 isImmutableMetadata 标记的舰体配置缓存解析后的插件定义。将“这些定义全部属于私有原生白名单”的布尔分类附在同一条目，仅省略重复 every/WeakSet 遍历；不缓存插件回调的运行结果。注册表拒绝覆盖，原生白名单不对扩展开放。普通/浅冻结/可变配置依旧实时解析；正、负结果均须正确，未知 ID 仍抛原错误。
3. Ship.hasVastBulk 的两个名单查询仍依原来的短路顺序读取 this.spec；不把两次 spec 读取合并。仅对项目自己深冻结、标记过的名单缓存原生 includes('vastbulk') 的结果，每次仍读取 includes 方法，方法替换走原调用。可变数组、仿冻对象、getter、自定义 includes 继续逐次调用；不按 Ship 身份缓存运行态。
4. 不改共享配置的所有权、不冻结现有可变挂点、不启用额外模块/协议，不把本文分类资格等同于可跨帧缓存舰船状态。

## 验证计划

在既有 simulation-hotpaths 检查中追加：注册元数据正负分类、外部插件回退、可变/浅冻结配置更改、未知 ID、返回数组所有权；VastBulk 的双名单短路、spec/list/includes getter 读取顺序、可变名单与替换、原生 includes 替换及恢复。完成候选后集中类型检查、lint、既有场景。以冻结源图做真实 kernel.step 配对，逐步比较显示/权威 witness/隐藏火控 RNG，完整权威快照检查点；100/200 舰与普通/混编验证。整步均值/P95 无收益则撤回，不以少遍历元数据代替性能。

## 当前状态

用户转而询问多核利用率/GPU 路线时，元数据候选尚未进入验收。已归档到 artifacts/fire-control-audit-20260924/unvalidated-metadata-candidate.json 并恢复本轮运行时代码，不宣称它已测试或提速。CPU 剖析记录有效，未取得实际生产多核/GPU 利用率数据。

后续说明：本候选中的 VastBulk 成员查询方向已在独立一轮加上稠密/原型/方法初始化保护并验证，见 `immutable-hullmod-query-performance-2026-09-24.md`。本候选的 HullMods 原生白名单布尔分类并未恢复；不要把旧归档整体视为已接受实现。
