# 五项组合验收前置：已实现护盾样式漏登记（2026-09-28）

## 证据与预期
本轮初次冻结756模块，尚未进入正确性固定步或浏览器：ModManager构建时抛出 web_ark_interceptor.shieldProfile 值无效: arkFighter。失败发生在优化全关的off.mjs，原始冻结、构建和日志保持不变。
- src/engine/content/AdunArkAviation.ts:14 使用arkFighter。
- src/engine/visual/VisualProfiles.ts:5/62 明确定义ShieldVisualKey和实际arkFighter参数。
- src/engine/render/webgl/WebGLShieldShader.ts按SHIELD_VISUAL_PROFILES[visual.shieldProfile]读取；已有脚本check-adun-ark.mjs也要求该样式。
- src/engine/modding/ContentValidation.ts:91仍是四项旧白名单，遗漏新已实现样式。
这是已有Web扩展的类型/渲染/校验连接，不新增原版能力、不改舰载机参数，不操作原版实机。不得把未知样式放行或删除validateShipVisual。

## 最小改动及保护
唯一生产写集：C:/Program Files (x86)/Starsector/starsector-web/src/engine/modding/ContentValidation.ts。将精确白名单增加arkFighter，不引入VisualProfiles/ContentRegistry运行时循环依赖，不改其它校验。保存改动前原字节、SHA和完整candidate SHA；该文件原本已有其它任务改动，只改这一字面量。

## 验证
一次typecheck、改动文件lint；同一组合正确性场景前增加合同：每个实际已实现护盾样式均接受；未知/空值/__proto__/constructor和坏颜色仍拒绝。随后新v2冻结只复查原先完全无法执行的组合/浏览器场景，不重跑任何性能对照。此次修复同时存在于A/B，不计入五项优化收益。若验收失败，只能按写集和SHA保存本轮补丁，不覆盖其它工作。
