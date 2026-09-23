# 观察者探测音效（0.98a-RC8）

## 编码前最小对照
- 原版证据：campaign/PingScript.java、CampaignFleet contact 分支及现有 OriginalFleetContact/OriginalCampaignPings；data/config/sounds.json 的 default_campaign_ping、detected_by_player、lost_sight_of_by_player。样本的 pitch/volume 不得忽略。
- 声音管线：com/fs/starfarer/D/M.java:160–207,286–357；同文件按实际样本文件、pitch/volume 差均小于 .2、相距不超过300去重，最近队列年龄大于 .05 秒移除；2500 外不播放；实体速度被置零。
- CampaignState.java:789–806：监听者是 viewport center，不是随意取 playerFleet；abyss depth 在这个版本明确置0，音乐 suppressor 只处理音乐，不给探测音加虚构滤波。
- CombatMain.java:222 与 fs.sound_obf/sound/C.java:202–252：reference distance=200，max distance=2500，AL_LINEAR_DISTANCE_CLAMPED(53252)，doppler=0；监听者 z=200，source z=0，朝-z/up+y。settings.json maxFXSources=128。WebAudio采用对应线性距离 Panner；不使用战斗 playAtPos 的2800/最低.05/手工pan规则。
- 变体选择：loading/specs/K.java:94–103 Math.random；e.java:20–40 默认 pitch/volume=1；随机只属于本地音频，不能消耗世界 RNG。
- 原版截图已查看用户近距参考 codex-clipboard-0f8416d5-0b94-44ab-8ebe-4ca699c5241c.png。本轮不改变UI布局；截图不能验证声音。不得操作原版可见窗口或声称实机听感验收。

## 差异与实施
现有服务端已经给认证观察者生成真实音效intent，浏览器没有消费。新增原版小范围音效规则与受当前画面生命周期约束的WebAudio适配器，真正接 NativeSceneCanvas；样本只从既有公共资源读取并核对原文件。遵循已有主音量/音效音量/静音/后台静音。浏览器需要手势，未解锁/丢失响应/不可用期间的声音不补播；资源未及时就绪丢弃过时声音，不积压。音频故障不能使导航或已渲染画面失效。场景序号去重，换地点/舰长/断线必须停止旧音源和异步加载后的旧播放。这里只接个人contact音效；世界脚本音效、消息音效、音乐/循环/EFX仍未完成。

## 验证
集中类型、改动lint、一个既有native personnel场景；纯规则测2500边界、样本增益、300去重/.05年龄/零速度；现有无头SQLite→HTTP→完整页面场景监测真实AudioBufferSource start和Panner参数，不伪造scene响应，不实际播放桌面声音。

## 实施结果
- 新增 OriginalCampaignAudio.mjs/.d.mts 与 reference-campaign-contact-sounds.json；3个音效集共13个原版单声道Ogg，公共副本逐字节一致，SHA256随表保留。新NativeSceneAudio消费实际认证场景，做真实decodeAudioData / BufferSource / Panner播放，沿用主音量/音效音量/静音/后台静音偏好。
- 每个server view增加sequence，和sceneId组成本地一次性消费边界；不会用world revision误吞同revision的不同探测事件。重复/旧序号不补播，换scene从新序号重启；断线、卸载、图形context丢失停止源并作废待解码播放。资源晚于250ms或已进入下一画面时不补放旧事件，这是Web传输明确策略，不是原版世界规则。
- 对应监听者取返回camera.center；Panner相对坐标z=-200、linear/ref200/max2500/rolloff1；原版谱表volume=.75或.05按float处理。超过2500的失去接触音intent实际被拒绝；不广播给另一舰长。
- 浏览器锁定时只准备资源，不积压声音；真实用户手势解锁。后台是否静音遵循原有设置，默认不强制额外静音。完整音频不可用时不伪造成功，也不阻止已确认导航。

## 验收记录
- 集中tsc-b退出0，7文件lint退出0；末尾后台设置审阅后仅定向lint复查。
- 同一既有native personnel场景首次与两次诊断复查在UI探测音等待处失败：页面确有圆环，但实际没有new_sensor_contact音效。诊断发现夹具使用了世界帧重算前的手改sensorProfile；600距离在真实帧后已不再是SENSOR_CONTACT。修正为从刚提交checkpoint的真实探测状态选择距离，第二次实际frame之后再断言仍是SENSOR_CONTACT，没有伪造响应或注入ping。
- 修正后同一场景1通过0失败、退出0，场景85663.6933ms，总86255.8067ms。SQLite→认证HTTP→完整NativeCampaignApp→真实WebAudio通过：650距离触发new_sensor_contact/detected_by_player，实际运行source含96000采样、单声道、pitch1、gain.75、linear/ref200/max2500/z-200；导航revision3，断开关闭context，pageerror空。原有Worker/事务回滚/重启/权限断言同场景仍通过。
- 两次针对失败的独立无头模块诊断证明实际13样本解码、单次播放、同序号不重播、新scene同序号可播放、clear停止全部voice；它们不是完整世界验收。没有跑全套，没有操作桌面或真实听音。
- 日志：artifacts/campaign-native-observer-audio-types.log、-lint.log、-scenario.log、-recheck.log、-trace.log、-final.log、-lint-final.log；失败日志保留，不包装成一次通过。

## 保留边界
这是个人contact的一次性探测音，不是完整音乐、世界脚本/能力空间音、消息音或OpenAL全套替代。来源/距离/增益/去重有源码与数值对照；浏览器实际节点已验收，但WebAudio equalpower与OpenAL听感/驱动/全局source pool抢占尚无实机等价证据。128上限是本地campaign mixer，不冒充跨战斗/UI的全局池。未改UI布局，因此不新截图冒充视觉进展。原自动世界、暂停/快进视觉时钟、NPC及正式开局缺口仍存在，readyForAuthority=false、simulation.status=unavailable保持。无子代理、无提交、推送、打包、发布。
