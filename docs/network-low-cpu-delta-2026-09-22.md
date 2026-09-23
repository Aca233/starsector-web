# 低CPU精确差分与客机还原测量 — 2026-09-22

> 2026-09-23 更新：结合真实双端交付受限日志，LAN 默认已恢复 motion-reference；显式 false 仍可选择低 CPU 路径。下文保留当时测量与取舍，当前行为见 [联机回归修复](network-regression-fix-2026-09-23.md)。

## 默认接线（历史测量时配置）

LAN/Web客户端保留完整快照、二进制字节差分、CRC/基线验证、消费credit、独立运动同步。只将motion-reference预测式**压缩**从默认开启改为显式 `VITE_LAN_MOTION_REFERENCE=true`。它不是画面插值或舰船运动预测：旧策略在发送端和接收端各扫描完整基线，构造临时预测压缩参考，再用差分纠正回精确目标字节。

普通差分省掉该额外扫描，但网络流量会上升。带宽紧张的构建仍可开启原有压缩；没有删除实现、放宽ACK、降低物理Hz或改变快照精度。Steam策略不变。未提交/推送/发布，无生涯内容改动。

## 测量边界与结果

复用现有 `benchmark-server-rooms.mjs`，增加 `--apply-replica`：每个客机独立worker，先加载真实createLanWorld，再loaded；SWF3 decoder与apply在同一bundle，避免PackedSnapshotNumbers类身份分裂。收到state后实际执行native apply，完成后才发state-consumed并记录input ACK。`--auto-motion`额外协商生产默认motionAuto并解码/确认独立运动包；**没有浏览器RAF、GPU、插值/本地预测控制器或公网/WAN**。

32舰、1房2客机、8秒、先关闭后开启motion-reference（同一authority bundle）：

| 指标（第2客机） | 原预测式压缩 | 普通精确差分 |
|---|---:|---:|
| 客机decode P50（含delta重建） | 2.752ms | 1.595ms |
| gateway P50 | 1.961ms | 1.053ms |
| 全进程CPU（包含主机/网关/客机） | 20250ms | 17796ms |
| apply Hz | 52.37 | 52.35 |
| 输入→apply完成 P50 | 31.86ms | 31.59ms |
| 输入→apply完成 P95 | 52.39ms | 50.54ms |
| 发送流量 | 5.50Mbps | 6.42Mbps |

结论：decode约减少42%、gateway约减少46%、全进程CPU约减少12%，代价流量约增加17%；**生产默认motionAuto场景Hz与中位延迟基本持平**，不能宣称四个目标已经达成。

较早的6秒兼容链路对照（未启用motionAuto）中，apply 53.50→55.50Hz、输入ACK中位34.04→28.61ms；只能作为该兼容场景的结果，不代替上表。都是本机短测，非带宽受限网络保证。

## 复现

从仓库根目录运行：

```powershell
node scripts/benchmark-server-rooms.mjs --runtime artifacts/record-deltas-20260922/baseline --ships 32 --rooms 1 --active-seconds 8 --apply-replica --auto-motion
# 对照增加 --no-motion-reference；其他参数和runtime不变。
```

`--benchmarks`构建也包含headless helper，已通过独立runtime 8舰smoke。原不带新参数的基准行为不变。完整数据见 `artifacts/record-deltas-20260922/summary.json`。

## 同期模拟改动

TacticalPositioning每炮每候选只构造一次射线长度平方，障碍物循环复用已有direction。24项AI场景 + 22舰300tick全快照字节/RNG差分通过。该差分样本模拟P50 9.6194→9.2584ms、均值9.8115→9.6893ms、P95 13.3253→13.8325ms；只是小幅median信号，尾部没有改善，不能称大幅稳定提速。

随后48舰实际authority达到56.57 physics /35.55 produced Hz（无错误），与其他时刻负载不可直接配对归因。仍未证明模拟/host Hz显著提升。下一步需消除aim/preAim重复查询或安全地传递已有Contact；不能以降频或跳过决策伪造收益。
