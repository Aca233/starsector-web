# 过载对齐记录（2026-09-17）

## 原版依据

- `decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/D.java`：`increaseFlux`、`forceOverload`、`beginOverloadWithTotalBaseDuration`、`getOverloadDissipationRate`、`getEMPDisplayMult`。
- `decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java`：`notifyOverloadStarted` 立即关盾；EMP 在舰体层、武器层之前绘制。
- `decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/I.java` 与 `oooo_1.java`：EMP 纹理、舰体 alpha 模板、分块与闪烁节拍。
- `starsector-core/graphics/fx/emp_arcs.png`、`data/config/hull_styles.json`：原版纹理及颜色。特殊 THREAT 色由 7 个原版 `.ship` 的 style 映射提取；新增导入直接从 hull_styles 读取 `overloadColor`，无须手填舰船分支。

## 本次修正

- 移除原先自行生成的轮廓放电、四道爆发电弧和按剩余比例变化的放电频率；改为原版贴花，不生成世界 EMP 实体，也不额外产生伤害。
- 默认 RGB 为 150/150/255；THREAT 为 213/255/237。小舰一片 128–256 单位纹理，大舰四片 256 单位纹理，中心偏移 ±96，各片转角相差 90°。
- 每次脉冲 0.0625–0.25 秒，亮度上限 0.5–1，前 1/5 保持亮度后衰减；过载结束前 0.25 秒整体淡出。贴花随舰体平移/转动，按舰体非零 alpha 裁切，绘制在炮塔下方。
- 护盾受击超过容量才进入过载，恰好达到容量不算；硬幅能命中的超量影响时长，普通软幅能命中只采用基础时长。计算惩罚后将软/硬幅能约束到容量内。
- 开火与维持成本不足时拒绝支出而非自过载；光束停止输出，普通护盾无法维持时关闭。正常受击过载当次就取消护盾碰撞，避免下一发继续被旧护盾吸收。
- 过载按有效耗散的 50% 散热，遵守本帧禁散规则。保留强制过载“舰级基础时长 + 额外秒数”与指定总时长接口的区别，不打断排幅，也不重启已有过载；指定时长接口不再错误播放正常护盾被击穿的声音。
- 移除“电弧熔断 / 深度过载”等额外播报；浮字改为本地化“过载！”，HUD 改为“幅能过载”。

## 验证与边界

- TypeScript、正式构建、定向 oxlint 通过；构建仅有既有大 chunk 提示。
- 无测试文件的内存回归覆盖阈值、夹紧、硬/软命中时长、强制时长、耗散倍率、排幅期间拒绝、即时关盾、高幅能光束停火、特殊风格色、闪烁/分块/淡出规则。
- 正式包临时浏览器中检查先锋与攻势，分别覆盖单片与四片贴花；两者舰体透明区漏光像素均为 0；无额外世界 EMP 电弧；暂停重复绘制 10 次没有新增纹理上传；控制台无 error。
- 没有进行原版游戏同镜头逐帧截图比对；本次是源码/原资源规则移植加 Web 实渲染验收，不宣称所有过载音频和外围舰船系统规则均已逐项复刻。
- 调试只修改临时预览页的场次，页签及 5175 预览服务已关闭，未修改用户当前 5173 场次；未新增测试文件，未运行全量资源导入或哈希/大小审计。
