# 实际联机页面 Worker 接入：修改前证据（2026-09-25）

原版版本0.98a-RC8；重新核对 `../starsector-core/data/config/settings.json:8–9` 的vsync/60fps和 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16–20` 的位置/速度/朝向接口。本次只搬迁呈现线程，不改权威步长、画质、数量、命令或规则。无新原版实机界面验证；不操作桌面、不注入OS输入，外观与交互等价仍待核实。

预期：实际LanBattle访客可显式选择Worker，主机和默认模式仍用原路径；输入在真正发送时读取独立实时坐标，接收回执必须等待Worker保留，UI沿用已有投影/命令接口。当前差异：先前通路只在Offscreen探针运行，真实页面尚未接入。

计划：VITE_LAN_PRESENTATION_WORKER=true仅选择非计算主机；异步启动失败由React换新canvas回退，不在转移后的canvas创建context。补齐JSON例外状态、失效视图清除、真实呈现阶段遥测和停止入口。集中冻结类型对照、改动lint、一个既有真实联机场景验收（DOM事件，不是OS输入）。测试不能证明SIM/FPS/端到端延迟收益；默认保持关闭，保留全部WIP及0.2.11，不提交/推送/打包/发布。
