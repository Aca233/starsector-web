# 真实地点/舰队自然帧接线（0.98a-RC8）

- 原版证据：BaseCampaignEntity.java:862–867 的 isVisible 是当前地点 + 视口扩展半径；CombatViewport.java:71–90 是原版float轴对齐边界（包含边界、inset递归、everythingNearViewport）；CampaignFleet.java:836–842 根据屏幕/跳跃预可见性推进或清理船图，875–883 的willBeVisible检查双方跳跃目的地；392–393 使用可空标志而非truthiness。
- 当前差异：Runtime真实地点→舰队已有移动/后勤/接触/视图实现，但默认舰队帧仍要求调用者临时提供isFleetVisible/willFleetBeVisible与当前势力颜色。上一轮事务场景地点仅录制，因此没有证明真实运动与后勤推进。
- 实现：原版视口判断由显式宿主readFleetViewport提供实际字段；Runtime绑定当前地点/原版玩家、真实势力颜色读取，保留mod服务覆盖。没有viewport时不返回假false；已知不跳跃可按原版短路，非空未实现跳跃对象仍要求真实目的地读取服务。
- 验证：将既有帧事务场景的成功地点路径替换为真实BaseLocation与双舰队自然推进；合成地点内加入实际舰船/物资，断言位置、速度、补给、视图和暂停/恢复。仍保留尚未实现顶层画面经理录制，不据此宣称整个星区/AI/正式开局完成。
- 本批不改UI布局。已有原版截图仅能证明远近/选中外观，不能证明自然帧时间；不操作桌面，原版同状态实机视觉对照仍待许可。缺完整插件不启用自动世界时钟，readyForAuthority=false。

- 自然帧首次已运行到补给断言：CargoData.java:670–699的partials先累计小数消耗，未满1单位不减少显示货栈；LogisticsModule.java:45–65按天数扣除。修正测试检查真实slots+partials有效余额，不改原版扣除规则。暂停检查同时覆盖partials，不能只看整数货物数。

- 固定玩家势力颜色来源：CampaignEngine.java:1438–1440 的 getPlayerFaction() 固定 getFaction("player")；SensorContactIndicatorManager.java:171/198 分别使用该势力的 baseUIColor/color，Faction.java:901–910 返回 spec 对应字段。不能使用可变关系经理 playerFaction 别名或当前舰队势力。Runtime 默认读取改为注册的固定 player；缺该势力仍拒绝，不补造。既有自然帧场景增加显式不同颜色的测试 player 势力，以真实舰队帧新接触 ping 和观察者绘制 RGB 验证两个默认 getter（不覆盖颜色服务）。

- 接线边界复核：OriginalCampaignFleetFrame 返回有序 contact/ability/logistics effects，但 OriginalLocationFrame 的实体调用与 OriginalCampaignEngine 的地点调用目前未把这些结果向宿主汇总，DevelopmentWorld 帧回执也仅包含时间/导航。直接舰队帧颜色回归不等于自然世界提示已送达 Web；后续须补事务内收集、按观察者披露与提交后派发，不能先对外播放后再尝试回滚。

- 最终验收：同一 native personnel 既有场景1通过0失败、退出码0（场景70484.5118ms，进程70989.7773ms）。本批首次颜色补测仅缺测试观察者本地 reportDetectedEntity，补齐本地记录后定向复查通过，未放宽生产服务校验。固定 player 的 ping RGBA 与问号顶点RGB均由 Runtime 默认 getter 验证；自然位置/补给/暂停/离屏/SQL回滚仍通过。类型检查与前批5文件lint已通过，本次颜色修正受影响文件lint通过；没有重跑全套。最终日志：artifacts/campaign-native-location-frame-color-scenario.log；静态日志：artifacts/campaign-native-location-frame-types.log、artifacts/campaign-native-location-frame-lint.log、artifacts/campaign-native-location-frame-color-lint.log。验收进程已退出，整体生涯目标仍active。
