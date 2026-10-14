# gravity_owner 已交付（最新）

gravity_owner.rs 和 actual TS Node/fresh Worker Oracle 已完整落盘，可立即接线。详见 `docs/rust-combat-gravity-owner-plan-2026-10-08.md` 的“实际交付、验证及生产接线合同”。每运行时 27,775 strict / 2,088 geometry，严格0差异；512几何查询/192tidal/16modulehit/16nestedpose/8capture/40authority/2063numberkey；最大geometry7.105e-15。Graviton正确Map顺序与void例外、模块assembly-root void contact、真实CombatFX粒子/visualRNG均已实装对照。Sparks Record 已带 Vec<world_damage::ArmorParticle>，展示不重生成。

最关键共享项：captured_by弹体 outgoing=1；gravity命中不能立即销毁，保留原end-world sweep；system_owner须GravityWell/GravityBattleWell/Other映射及真实collapse状态，collapse期间不扣well upkeep；逐allSystems `dispatch_slot` + `restore_slot`；每barrier hydrate真实mount许可/range，weapontractor绕开generic emission且cooldown只推进一次。Owned含真实terrain，None必须拒绝；whole step snapshot/rollback覆盖全部metadata。交付时world_owner的 `shield.data[41..45]` slice越界，具体来源风险在策划末尾供root定向核对。不改共享文件，无stage/commit/push/release。

# gravity_owner 原任务

Root接线更新：新增actual `world_owner.rs`、lib引用world_damage/explosion_effects/terrain_world；CombatShip新增 `death:Option<world_owner::Meta>`，Projectile新增fighter_decoy bool；battle advance_projectiles/advance_beams签名增加specs与Option<&mut world_owner::Owned>。隔离fixture需引用actual world_owner或显式未安装death的拒绝stub；不得改shared。world_owner::Host保存真实 bodies/specs/ordnance/Owned/events；Owned将保存共用terrain与完整death/explosion/FX。damage全边界ShipState::apply_hull新增，armor_impact positive cell listener已接FieldRepair；不要重加aggregate callback。Root尚在开发，不保证当前source冻结。请在接口合同写全未闭合处，避免将缺shared oracle说完整。

主用户要求全部完成并可正常游玩。gravity_world 已完成；请现在实现 `native/combat-core/src/gravity_owner.rs` 和对应实质接线策划、独立 actual TS 集中对照。不要递归代理。

你负责 gravity_world 实际 resident Body/ShipState/Ordnance 的同步 Host 适配和常驻 metadata；不修改 lib/state/ship_state/battle/projectile/protocol 文件，root 负责接入。可以提出这些 shared 文件需要的最小字段/调用并在本文件写出契约。不要把所有 lifecycle 再复制推进：ShipState.systems 唯一持有 System，gravity_world Slot 借当前 lifecycle 后回写；World 临时执行时恢复元数据。

先读原版和真实Web来源、写可审阅策划并说明。请覆盖全部 gravity_world Host：真实 assembly/roster/polygon/shield/weak-hulk geometry、实时 velocity/flux、tidal hit 真实 Armor/Component/Flux 路径、capture/binding、模块同步；需要terrain环境时用typed适配输入而非假空列表。只能暂时使用隔离fixture的environment，不能把empty world当production完成。locale order一次性编译可由root传入实际Intl排位，切勿用Rust字典序冒充JS localeCompare。

Root正在修改 system_owner/ship_state/battle/fire_query/state，以现有最新源为准；独立文件避免循环依赖，尽量复用真实contact/weapon_effects_owner。damage/death世界适配正待root，可通过typed Rust trait扩展真实外部world伤害，不用JS或record-only动作。明确定义捕获/速度/绑定所需projectile字段和生成代次。

任务范围完整，不静默去掉特殊引力系统/武器。保持原Web严格规则/RNG合同；Host失败向整步回滚。集中Node/fresh headless Worker actualTS oracle，并给root准确集成API和未闭合的共享依赖。禁止stage/commit/push/release、可见窗口或输入。已有用户授权无需确认。
