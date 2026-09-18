import { DwellReader } from './DwellTooltip';
import { useDwellHover } from './useDwellHover';
import { EquipmentTooltip } from './EquipmentTooltip';
import { RefitExplanationText, RefitHoverTerm } from './RefitHoverTerms';
import { RefitHint } from './RefitHint';
import { MotionPresence } from '../ui/core/MotionPresence';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { combatSkillDefinitions, type CombatSkillLoadout } from "../engine/extensions/CombatSkills";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { Modal } from "../ui/core/UI";
import { captainPortraits, defaultCaptainProfile, validCaptainProfile, type CaptainProfile } from "./CaptainProfile";
import tree from "./native-skill-tree.json";
import "./captain-skills.css";

const definitions = new Map(combatSkillDefinitions.map(skill => [skill.id, skill]));
type NativeSkill = typeof tree.skills[number];
type SkillFilter = "all" | "supported" | "configured";
const asset = (path: string) => runtimeAssetUrl(`/game-assets/${path}`);
const portraitUrl = (id: string) => asset(`graphics/portraits/${id}.png`);
const aptitudeStyle = (id: string) => ({ "--aptitude-color": `rgb(${tree.aptitudes.find(item => item.id === id)?.color.split(",").slice(0, 3).join(" ")})` }) as CSSProperties;
const nativeScope = (skill: NativeSkill) => skill.scopeLabel || ({
  PILOTED_SHIP: "座舰", ALL_SHIPS: "舰队舰船", FLEET: "舰队", CHARACTER: "角色", NONE: "—", CUSTOM: "见原版说明",
} as Record<string, string>)[skill.scope] || "见原版说明";
const effectLines = (text: string) => text.split("；").map((line, index) => <p key={index}><RefitExplanationText text={line} /></p>);

interface Props {
  launchLabel?: string;
  value: CombatSkillLoadout;
  profile?: CaptainProfile;
  designName: string;
  hullName: string;
  status: string;
  dirty: boolean;
  warning: string | null;
  backLabel: string;
  canUndo: boolean;
  launchDisabledReason: string | null;
  onChange: (value: CombatSkillLoadout) => void;
  onProfileChange: (profile: CaptainProfile) => void;
  onBack: () => void;
  onRefit: () => void;
  onLaunch: () => void;
  onUndo: () => void;
  onSave: () => boolean;
  onExport: () => void;
  onImport: () => void;
}

function ProfileEditor({ profile, onApply, onClose }: {
  profile: CaptainProfile; onApply: (value: CaptainProfile) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  return <Modal title="舰长档案" description="姓名和头像随当前舰船方案保存，不改变战斗属性。" width="regular" onClose={onClose} footer={<>
    <NativeButton onClick={onClose}>取消</NativeButton>
    <NativeButton disabled={!validCaptainProfile(draft)} onClick={() => { onApply({ ...draft, name: draft.name.trim() }); onClose(); }}>应用档案</NativeButton>
  </>}>
    <label className="captain-profile-name">舰长姓名<input aria-label="舰长姓名" value={draft.name} maxLength={24} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <fieldset className="captain-portrait-picker"><legend>选择头像</legend>{captainPortraits.map(portrait => <RefitHint key={portrait.id} text={portrait.name}><label  >
      <input type="radio" name="captain-portrait" aria-label={portrait.name} checked={draft.portrait === portrait.id} onChange={() => setDraft({ ...draft, portrait: portrait.id })} />
      <img src={portraitUrl(portrait.id)} alt="" /><span>{portrait.name}</span>
    </label></RefitHint>)}</fieldset>
  </Modal>;
}

/** Native four-aptitude layout over the existing design's combat loadout. */
export function CaptainSkillsScreen(props: Props) {
  const { value, onChange, onBack, onLaunch, onUndo, canUndo, launchDisabledReason } = props;
  const profile = props.profile ?? defaultCaptainProfile;
  const [selectedId, setSelectedId] = useState("missile_specialization");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [clearOpen, setClearOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [encyclopedia, setEncyclopedia] = useState<NativeSkill | null>(null);
  const skillHover = useDwellHover({ enabled: !clearOpen && !profileOpen && !encyclopedia });
  const { hide: hideSkill } = skillHover;
  const hoverSkill = tree.skills.find(skill => skill.id === skillHover.active?.id);
  const hoverDefinition = hoverSkill ? definitions.get(hoverSkill.id) : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const chosenCount = Object.keys(value).length;
  const eliteCount = Object.values(value).filter(level => level === 2).length;
  const visibleSkills = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return tree.skills.filter(skill => (filter !== "supported" || definitions.has(skill.id)) &&
      (filter !== "configured" || value[skill.id]) &&
      (!text || `${skill.name} ${skill.id} ${definitions.get(skill.id)?.name ?? ""}`.toLocaleLowerCase().includes(text)));
  }, [query, filter, value]);
  const visibleIds = new Set(visibleSkills.map(skill => skill.id));
  const effectiveSelectedId = visibleIds.has(selectedId) ? selectedId : visibleSkills[0]?.id ?? selectedId;
  const active = tree.skills.find(skill => skill.id === effectiveSelectedId) ?? tree.skills[0];
  const definition = definitions.get(active.id);
  const activeLevel = value[active.id] ?? 0;
  const supported = !!definition;
  const levelLabel = (id: string) => !definitions.has(id) ? "未接入，仅可查看" : value[id] === 2 ? "精英" : value[id] === 1 ? "普通" : "未配置";
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { details.current?.scrollTo({ top: 0 }); }, [active.id]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const typing = event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]');
      if (event.key === "Escape") { event.preventDefault(); onBack(); return; }
      if (typing) return;
      const actions: Record<string, () => void> = {
        c: onBack,
        t: () => { if (chosenCount) setClearOpen(true); },
        g: () => { if (!launchDisabledReason) onLaunch(); },
        u: () => { if (canUndo) onUndo(); },
        f2: () => { setEncyclopedia(hoverSkill ?? active); hideSkill(); },
        "/": () => search.current?.focus(),
      };
      const action = actions[event.key.toLowerCase()];
      if (action) { event.preventDefault(); action(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onBack, chosenCount, launchDisabledReason, onLaunch, canUndo, onUndo, active, hoverSkill, hideSkill]);
  const setLevel = (id: string, level: number) => {
    // Use the clicked ID, not the hovered detail: focus/selection updates may still be pending.
    if (!definitions.has(id)) return;
    const next = { ...value };
    if (level === 1 || level === 2) next[id] = level;
    else delete next[id];
    onChange(next);
  };
  const selectSkill = (id: string) => { hideSkill(); setSelectedId(id); };
  const advanceSkill = (id: string) => {
    selectSkill(id);
    setLevel(id, value[id] ? 2 : 1);
  };
  const navigateSkill = (event: KeyboardEvent<HTMLButtonElement>, skill: NativeSkill) => {
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); selectSkill(skill.id); setLevel(skill.id, 0); return; }
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const row = visibleSkills.filter(item => item.aptitude === skill.aptitude);
    const index = row.findIndex(item => item.id === skill.id);
    let next: NativeSkill | undefined;
    if (event.key === "ArrowLeft") next = row[(index - 1 + row.length) % row.length];
    if (event.key === "ArrowRight") next = row[(index + 1) % row.length];
    if (event.key === "Home") next = row[0];
    if (event.key === "End") next = row.at(-1);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const rows = tree.aptitudes.filter(item => visibleSkills.some(entry => entry.aptitude === item.id));
      const i = rows.findIndex(item => item.id === skill.aptitude);
      const nextRow = rows[(i + (event.key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length];
      const items = visibleSkills.filter(item => item.aptitude === nextRow.id);
      next = items[Math.min(index, items.length - 1)];
    }
    if (next) { hideSkill(); setSelectedId(next.id); buttons.current.get(next.id)?.focus(); }
  };

  return <main className="captain-skills-screen" aria-labelledby="captain-skills-title">
    <h1 id="captain-skills-title" className="captain-sr-only" ref={heading} tabIndex={-1}>角色技能</h1>
    <NativeFrame className="captain-character-sheet" surface="glass">
      <div className="captain-sheet-top">
        <aside className="captain-character" aria-label="当前舰长配置">
          <RefitHint text="编辑舰长姓名与头像"><button type="button" className="captain-name-button" onClick={() => setProfileOpen(true)} >{profile.name}<span>编辑档案</span></button></RefitHint>
          <div className="captain-character-body">
            <button type="button" className="captain-portrait-button" aria-label="编辑舰长头像" onClick={() => setProfileOpen(true)}><img src={portraitUrl(profile.portrait)} alt="舰长头像" /></button>
            <dl className="captain-points"><div><dt>技能点</dt><dd className="captain-yellow">∞</dd><small>自由配置</small></div><div><dt>故事点</dt><dd className="captain-muted">—</dd><small>未启用</small></div></dl>
          </div>
          <div className="captain-progress" role="progressbar" aria-label="已配置技能" aria-valuemin={0} aria-valuemax={combatSkillDefinitions.length} aria-valuenow={chosenCount}><i style={{ width: `${chosenCount / combatSkillDefinitions.length * 100}%` }} /></div>
          <div className="captain-loadout-count" aria-live="polite"><span>已配置 <b>{chosenCount}/{combatSkillDefinitions.length}</b></span><span>精英 <b>{eliteCount}</b></span></div>
          <RefitHint text={`${props.designName} · ${props.hullName}-级`}><p className="captain-current-design" >{props.designName} · {props.hullName}-级</p></RefitHint>
          <div className="captain-character-actions">
            <NativeButton shortcut="T" disabled={!chosenCount} onClick={() => setClearOpen(true)}>重置技能</NativeButton>
            <RefitHint text={props.launchDisabledReason ?? props.launchLabel ?? "使用当前方案和技能进入模拟战斗"}><NativeButton shortcut="G" disabled={!!props.launchDisabledReason}  onClick={props.onLaunch}>{props.launchLabel ?? "开始模拟"}</NativeButton></RefitHint>
          </div>
        </aside>
        <section className="captain-skill-detail" style={aptitudeStyle(active.aptitude)} aria-label="技能详情" ref={details} tabIndex={0}>
          <DwellReader><header className="captain-detail-title"><h2>{active.name}</h2><span>{supported ? activeLevel === 2 ? "精英已配置" : activeLevel === 1 ? "普通已配置" : "可配置" : "未接入 · 仅可查看"}</span></header>
          <blockquote><p>{active.quote}</p><cite>－ {active.author}</cite></blockquote>
          <p className="captain-detail-scope">影响：<strong>{nativeScope(active)}</strong>{active.id === "point_defense" && <span>（含所属战机）</span>}</p>
          {definition ? <div className="captain-effects">
            <div className="captain-normal-effects">{effectLines(definition.normal)}</div>
            <h3><RefitHoverTerm term="elite">精英</RefitHoverTerm></h3><div className="captain-elite-effects">{effectLines(definition.elite)}</div>
          </div> : <div className="captain-unimplemented"><p>此角色技能尚未接入 Web 版，不能学习或获得加成。</p><p>保留原版图标、引文和分类供查看；相关舰装或舰船系统已经实现，不代表此技能已经生效。</p></div>}
          <p className="captain-native-requirement">{active.requiredPoints > 0 ? `原版需先投入至少 ${active.requiredPoints} 点低阶技能；` : ""}Web 沙盒不消耗技能点、故事点，也不限制低阶技能门槛。</p>
          <div className="captain-detail-controls">
            <button type="button" className="captain-codex-button" onClick={() => setEncyclopedia(active)}>按 <b>F2</b> 打开数据百科</button>
          </div></DwellReader>
        </section>
      </div>
      <section className="captain-aptitude-tree" aria-label="四系技能树">
        {tree.aptitudes.map(aptitude => {
          const entries = tree.skills.filter(skill => skill.aptitude === aptitude.id && visibleIds.has(skill.id));
          return <section className="captain-aptitude-row" key={aptitude.id} style={aptitudeStyle(aptitude.id)} aria-label={`${aptitude.name}系技能`}>
            <RefitHint text={aptitude.description}><div className="captain-aptitude-label" ><img src={asset(aptitude.icon)} alt="" /><h3>{aptitude.name}</h3></div></RefitHint>
            <span className="captain-aptitude-arrow" aria-hidden="true">❯</span>
            <div className="captain-aptitude-icons">
              {entries.map((skill, index) => <button type="button" key={skill.id}
                ref={element => { if (element) buttons.current.set(skill.id, element); else buttons.current.delete(skill.id); }}
                className={`captain-skill-icon ${definitions.has(skill.id) ? "is-supported" : "is-unimplemented"} ${value[skill.id] ? "is-configured" : ""} ${value[skill.id] === 2 ? "is-elite" : ""} ${index && entries[index - 1].tier !== skill.tier ? "new-tier" : ""}`}
                data-skill-id={skill.id} aria-label={`${skill.name} · ${levelLabel(skill.id)}`} aria-pressed={effectiveSelectedId === skill.id}
                {...skillHover.bind(skill.id)}
                onFocus={event => { setSelectedId(skill.id); skillHover.bind(skill.id).onFocus(event); }} onClick={() => advanceSkill(skill.id)}
                onContextMenu={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); selectSkill(skill.id); setLevel(skill.id, 0); }} onKeyDown={event => navigateSkill(event, skill)}>
                <img src={asset(skill.icon)} alt="" />
                {value[skill.id] === 2 && <img className="captain-elite-overlay" src={asset(`graphics/icons/skills/elite_${aptitude.id}.png`)} alt="" />}
                {value[skill.id] && <span className="captain-configured-badge">{value[skill.id] === 2 ? "Ⅱ" : "Ⅰ"}</span>}
                {!definitions.has(skill.id) && <span className="captain-unimplemented-mark" aria-hidden="true">—</span>}
              </button>)}
              {!entries.length && <p className="captain-empty-row">{query || filter === "configured" ? "没有匹配的技能" : "此系暂未接入可配置技能"}</p>}
            </div>
          </section>;
        })}
      </section>
    </NativeFrame>
    {hoverSkill && <EquipmentTooltip hover={skillHover} preferSide>
      <h3>{hoverSkill.name} · {levelLabel(hoverSkill.id)}</h3>
      <p className="equipment-state">原版范围：{nativeScope(hoverSkill)} · Web 配置仅随当前方案生效</p>
      <p>{hoverSkill.quote} —— {hoverSkill.author}</p>
      {hoverDefinition ? <>
        <h4><RefitHoverTerm term="skill">普通效果</RefitHoverTerm></h4>
        <p><RefitExplanationText text={hoverDefinition.normal} highlightNumbers /></p>
        <h4><RefitHoverTerm term="elite">精英效果</RefitHoverTerm></h4>
        <p><RefitExplanationText text={hoverDefinition.elite} highlightNumbers /></p>
        <p className="equipment-state">左键：普通 → 精英 · 右键取消；不消耗技能点或故事点。</p>
      </> : <p className="equipment-state">此角色技能尚未接入 Web 版，仅保留原版资料，不能配置或获得加成。</p>}
      <p className="equipment-state">原版基础门槛：{hoverSkill.requiredPoints} 点；额外同阶门槛增量：{hoverSkill.extraSkillPoints} 点。Web 自由配置不执行这些解锁条件。</p>
      <button type="button" className="equipment-encyclopedia" onClick={() => { setEncyclopedia(hoverSkill); hideSkill(); }}>按 <kbd>F2</kbd> 打开数据百科</button>
    </EquipmentTooltip>}
    <footer className="captain-web-tools" aria-label="Web 配置工具">
      <div className="captain-web-toolbar">
        <div className="captain-search"><input ref={search} aria-label="搜索技能" placeholder="搜索技能 /" value={query} onChange={event => { hideSkill(); setQuery(event.target.value); }} />{query && <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="清除搜索">×</button>}</div>
        <select aria-label="筛选技能" value={filter} onChange={event => { hideSkill(); setFilter(event.target.value as SkillFilter); }}><option value="all">全部技能 · 40</option><option value="supported">可配置 · {combatSkillDefinitions.length}</option><option value="configured">已配置 · {chosenCount}</option></select>
        <span className="captain-search-result" role="status">{visibleSkills.length} 项 · 暗色仅供查看</span>
        <div className="captain-web-actions">
          <RefitHint text="撤消最近一次技能、档案或装配修改"><NativeButton onClick={props.onUndo} disabled={!props.canUndo} >撤消</NativeButton></RefitHint>
          <NativeButton onClick={props.onImport}>导入方案</NativeButton><NativeButton onClick={props.onExport}>导出方案</NativeButton>
          <NativeButton shortcut="Ctrl+S" onClick={() => props.onSave()}>保存方案</NativeButton>
          <NativeButton onClick={props.onRefit}>舰船改装</NativeButton><NativeButton shortcut="Esc" onClick={onBack}>{props.backLabel}</NativeButton>
        </div>
      </div>
      <div className="captain-web-status"><span className="captain-click-help">左键：普通 → 精英 · 右键：取消</span><span role="status">{props.status}{props.dirty ? " · 有未保存到方案库的修改" : ""}</span><span>自动生效 · 技能与档案随当前舰船方案保存，不是全舰队加成</span></div>
    </footer>
    {props.warning && <div className="captain-storage-warning" role="alert"><span>{props.warning}</span><NativeButton onClick={props.onExport}>导出方案备份</NativeButton></div>}
    <MotionPresence>{clearOpen && <Modal title="重置全部舰长技能？" description="只清除当前方案的技能，舰长档案、武器、插件和其他装配保持不变。可以撤消恢复。" width="small" onClose={() => setClearOpen(false)} footer={<>
      <NativeButton onClick={() => setClearOpen(false)}>取消</NativeButton><NativeButton onClick={() => { onChange({}); setClearOpen(false); }}>确认重置</NativeButton>
    </>}><p>已保存的方案副本不会立即改变；再次保存方案后才会覆盖。</p></Modal>}</MotionPresence>
    {profileOpen && <ProfileEditor profile={profile} onApply={props.onProfileChange} onClose={() => setProfileOpen(false)} />}
    <MotionPresence>{encyclopedia && <Modal title={`${encyclopedia.name} · 数据百科`} eyebrow="角色技能资料" width="regular" onClose={() => setEncyclopedia(null)} footer={<NativeButton onClick={() => setEncyclopedia(null)}>返回技能</NativeButton>}>
      <div className="captain-encyclopedia"><img src={asset(encyclopedia.icon)} alt="" /><div><h3>{tree.aptitudes.find(item => item.id === encyclopedia.aptitude)?.name} · 第 {encyclopedia.tier} 阶</h3><p>原版作用范围：{nativeScope(encyclopedia)}</p><p>Web 状态：{definitions.has(encyclopedia.id) ? "普通与精英战斗效果已接入" : "仅资料，尚无此角色技能的运行适配"}</p></div></div>
      <blockquote className="captain-encyclopedia-quote">{encyclopedia.quote}<cite>－ {encyclopedia.author}</cite></blockquote>
      {definitions.has(encyclopedia.id) && <DwellReader><div className="captain-encyclopedia-effects"><h3>普通效果</h3><p><RefitExplanationText text={definitions.get(encyclopedia.id)!.normal} /></p><h3><RefitHoverTerm term="elite">精英效果</RefitHoverTerm></h3><p><RefitExplanationText text={definitions.get(encyclopedia.id)!.elite} /></p></div></DwellReader>}
      <p className="captain-encyclopedia-source">原版基础门槛：{encyclopedia.requiredPoints} 点；额外同阶技能门槛增量：{encyclopedia.extraSkillPoints} 点。Web 自由配置不执行这些解锁条件。</p>
      <p className="captain-encyclopedia-source">资料来源：{encyclopedia.source}<br />{definitions.get(encyclopedia.id)?.source ? `战斗适配：${definitions.get(encyclopedia.id)!.source}` : "不把资料收录视为技能实现。"}</p>
    </Modal>}</MotionPresence>
  </main>;
}
