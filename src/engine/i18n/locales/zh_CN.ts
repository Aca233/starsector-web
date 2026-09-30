export const zh_CN: Record<string, string> = {
  // 通用与界面
  'app.title': '自造舰船工作台',
  'app.subtitle': '双轨解耦架构 (60Hz 逻辑帧 / 显示器自适应渲染帧) | 纯模块化数据驱动',
  'app.switch_ship': '切换驾驶战舰',
  'app.switch_to_onslaught': '驾驶 攻势级 (Onslaught)',
  'app.switch_to_paragon': '驾驶 典范级 (Paragon)',
  'app.reset_battle': '重置战局',
  'app.mod_manager': '舰船 Mod 工作台',
  'app.controls': '操控指南: W 前进 | S 倒车 | X 制动 | A/D 左右侧移 | 鼠标 瞄准瞄线 | 左键 开火 | 右键 启闭护盾 | V / 空格 主动排散载荷 | F 激活战术系统 (冲刺推进 / 堡垒护盾)',

  // 战术 HUD
  'hud.hull': '装甲结构值',
  'hud.flux': '载荷水平',
  'hud.flux_soft': '软载荷',
  'hud.flux_hard': '硬载荷',
  'combat.overloaded': '过载！',
  'hud.overloaded': '系统严重过载！正在强制冷却: {time}s',
  'hud.venting': '正在紧急排散载荷... {progress}%',
  'hud.system_burn_drive': '冲刺推进系统 (Burn Drive)',
  'hud.system_fortress_shield': '堡垒护盾系统 (Fortress Shield)',
  'hud.system_ready': '就绪',
  'hud.system_active': '运行中',
  'hud.system_cooldown': '冷却中: {time}s',
  'hud.weapon_groups': '火控武器编组',
  'hud.group_linked': '齐射 (LINKED)',
  'hud.group_alternating': '交替 (ALT)',
  'hud.group_auto': '自动 (AUTO)',
  'hud.group_active': '选定 [左键开火]',
  'hud.armor_grid': '2D 装甲网格损伤矩阵 (局部均摊模型)',
  'hud.fps_render': '渲染帧率: {fps} FPS',
  'hud.fps_sim': '模拟逻辑: {tps} TPS (固定 60Hz 确定性步长)',
  'hud.interpolation_alpha': '亚帧插值率 α: {alpha}',

  // 舰船名称与描述 (完全与数据解耦)

  // 武器名称与描述

  // 厄运级与新武器
  'hud.system_mine_strike': '空雷突袭系统 (Mine Strike)',

  // 阔剑战机与机枪

  // 匕首级鱼雷轰炸机与阿特罗波斯

  // 战术地图与指令
  'hud.btn_tactical_map': '战术地图 (TAB)',
  'hud.tactical_map_title': '星区战术指挥全景视图 (TAC-OPS RADAR GRID)',
  'hud.command_points': '指挥点数',
  'hud.btn_recall_fighters': '战机召回 (Z)',
  'hud.countermeasures_ready': '热焰诱饵就绪',
  'hud.countermeasures_cooldown': '热焰诱饵冷却中: {time}s',
  'hud.command_engage': '指令: 集火歼灭 (ENGAGE)',
  'hud.command_waypoint': '指令: 战术航路点 (WAYPOINT)',

  // 伤害类型
  'damage.kinetic': '动能伤害 (对护盾 200% / 对装甲 50%)',
  'damage.high_explosive': '高爆伤害 (对装甲 200% / 对护盾 50%)',
  'damage.energy': '能量伤害 (平衡伤害 100%)',
  'damage.fragmentation': '破片伤害 (对结构 100% / 对护盾装甲 25%)',

  // 战斗展示可用性
  'combat.shield_malfunction': '护盾失效！',
  'combat.availability.loading_title': '正在准备战斗画面',
  'combat.availability.loading_detail': '正在加载战斗资源并初始化 WebGL2。',
  'combat.availability.context_lost_title': '战斗画面暂时不可用',
  'combat.availability.context_lost_detail': 'WebGL 上下文已丢失，正在等待浏览器恢复。战斗推进已暂停。',
  'combat.availability.restoring_title': '正在恢复战斗画面',
  'combat.availability.restoring_detail': '正在重建 GPU 资源并重新准备必要纹理。',
  'combat.availability.failed_title': '无法显示战斗画面',
  'combat.availability.failed_detail': '此战斗需要可用的 WebGL2。请确认浏览器图形加速可用，然后刷新页面重试。',
  'combat.availability.webgl2_unsupported': '当前环境无法创建 WebGL2 战斗上下文。',
  'combat.availability.renderer_init_failed': 'WebGL2 战斗渲染器初始化失败。',
  'combat.availability.resource_prepare_failed': '必要的战斗图形资源准备失败。',
  'combat.availability.context_restore_failed': '战斗画面恢复失败。',
  'combat.availability.refresh': '刷新页面'
};
