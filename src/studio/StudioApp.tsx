import { MotionPresence } from '../ui/core/MotionPresence';
import { randomId } from "../shared/RandomId";
import { type ComponentProps, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui/core/UI";
import { i18n } from "../engine/i18n/LocalizationManager";
import { zh_CN } from "../engine/i18n/locales/zh_CN";
import { en_US } from "../engine/i18n/locales/en_US";
import {
  createDesign,
  data,
  decodeDesign,
  evaluate,
  readLibrary,
  writeLibrary,
  DesignLibraryConflictError,
  registerPrototype,
  storageKey,
  withWeapon,
} from "./DesignModel";
import type { HullFilter } from "./HullRoster";
import type { Design, DesignLibrary } from "./DesignModel";
import { NativeRefit } from "./NativeRefit";
import { NativeHome } from "./NativeHome";
import { pushStudioLocation, readStudioLocation, type SkillsOrigin, type StudioLocation, type StudioPage } from "./StudioNavigation";
import { NativeButton } from "../ui/NativeChrome";
import { simulationHullCost } from "../ui/tactical/SimulationRoster";
import "./studio.css";
import "./source-variant-picker.css";
import "./source-weapon-picker.css";
const CaptainSkillsScreen = lazy(() => import("./CaptainSkillsScreen").then(module => ({ default: module.CaptainSkillsScreen })));
const NativeCatalog = lazy(() => import("./NativeCatalog"));
const CombatView = lazy(() => import("../CombatView"));
i18n.registerStrings("zh_CN", zh_CN);
i18n.registerStrings("en_US", en_US);
const signature = (d: Design) => JSON.stringify({ ...d, updatedAt: 0 });
type Confirmation = {
  title: string;
  body: string;
  run: (saved?: boolean) => void;
  saveable?: boolean;
  action?: string;
};
type HomeNavigation = Pick<ComponentProps<typeof NativeHome>, "onLan" | "onSteam" | "entryError" | "staticHosted">;
export function StudioApp({ homeNavigation }: { homeNavigation: HomeNavigation }) {
  const [initialLocation] = useState(readStudioLocation);
  const currentUrl = useRef(window.location.href);
  const [initial] = useState(readLibrary);
  const [draft, setDraft] = useState(initial.library.draft);
  const [designs, setDesigns] = useState(initial.library.designs);
  // A newly opened ship is not an edit merely because it has no saved variant.
  const [baseline, setBaseline] = useState(
    initial.library.baseline ?? initial.library.draft,
  );
  const [view, setView] = useState<"home" | "editor" | "skills" | "combat">(initialLocation.page === "catalog" ? "home" : initialLocation.page);
  const [skillsOrigin, setSkillsOrigin] = useState<SkillsOrigin>(initialLocation.skillsOrigin);
  const [catalogOpen, setCatalogOpen] = useState(initialLocation.page === "catalog");
  const [editorKey, setEditorKey] = useState(0);
  const [hullFilter, setHullFilter] = useState<HullFilter>({query: "", hullClass: "", faction: ""});
  const hullScrollPosition = useRef(0);
  const readHullScroll = useCallback(() => hullScrollPosition.current, []);
  const writeHullScroll = useCallback((value: number) => { hullScrollPosition.current = value; }, []);
  const [history, setHistory] = useState<Design[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(
    initial.error,
  );
  const [saveState, setSaveState] = useState("草稿");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [trial, setTrial] = useState<{
    id: string;
    name: string;
    key: number;
    deploymentCost: number;
  } | null>(null);
  const protectedStorage = useRef(initial.protected);
  const observedStorage = useRef(initial.observedRaw);
  const uncached = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = designs.find((d) => d.id === draft.id);
  const dirty = signature(saved ?? baseline) !== signature(draft);
  const evaluation = useMemo(() => evaluate(draft), [draft]);
  const persist = (
    nextDraft: Design,
    nextDesigns: Design[],
    nextBaseline = baseline,
  ) => {
    if (protectedStorage.current)
      throw new Error("原方案数据已保护。请导出当前方案后刷新。");
    const value: DesignLibrary = {
      version: 1,
      draft: nextDraft,
      designs: nextDesigns,
      baseline: nextBaseline,
    };
    try {
      observedStorage.current = writeLibrary(value, observedStorage.current);
      uncached.current = false;
      setStorageWarning(null);
    } catch (e) {
      uncached.current = true;
      if (e instanceof DesignLibraryConflictError) {
        protectedStorage.current = true;
        setStorageWarning(e.message);
      } else {
        setStorageWarning("浏览器未能保存方案。当前修改仅在内存中，请导出备份。");
      }
      throw e;
    }
  };
  useEffect(() => {
    if ((view !== "editor" && view !== "skills") || catalogOpen) return;
    uncached.current = true;
    if (protectedStorage.current) {
      setSaveState("写入已暂停");
      return;
    }
    setSaveState("正在缓存");
    const timer = window.setTimeout(() => {
      try {
        persist(draft, designs);
        setSaveState("草稿已缓存");
      } catch (e) {
        setSaveState("仅在内存");
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, designs, baseline, view, catalogOpen]);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === storageKey || e.key === null) {
        protectedStorage.current = true;
        uncached.current = true;
        setStorageWarning(
          "另一标签页修改了方案库。本页已暂停写入，请先导出当前方案，再刷新。",
        );
      }
    };
    const leaving = (e: BeforeUnloadEvent) => {
      if (uncached.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("storage", changed);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("beforeunload", leaving);
    };
  }, []);
  useEffect(() => {
    document.title =
      catalogOpen ? "远行星号 · 全量原版内容" : view === "home"
        ? "远行星号 · 舰船设计"
        : draft.name + (view === "combat" ? " · 模拟战斗" : view === "skills" ? " · 角色技能" : " · 舰队改装");
  }, [view, draft.name, catalogOpen]);
  const change = (next: Design) => {
    if (signature(next) === signature(draft)) return;
    setHistory((h) => [...h.slice(-39), structuredClone(draft)]);
    setDraft({ ...next, updatedAt: Date.now() });
  };
  const open = (d: Design) => {
    setEditorKey((k) => k + 1);
    setDraft(structuredClone(d));
    setBaseline(structuredClone(d));
    setHistory([]);
  };
  const save = (candidate: Design = draft) => {
    const candidateSaved = designs.find(d => d.id === candidate.id);
    if (!candidate.name.trim()) {
      setError("请填写方案名称。");
      return false;
    }
    const saveAsNew = !!candidateSaved && candidateSaved.name !== candidate.name.trim();
    if ((!candidateSaved || saveAsNew) && designs.length >= 100) {
      setError("最多保存 100 个方案，请先导出并删除不需要的方案。");
      return false;
    }
    const next = {
      ...structuredClone(candidate),
      id: saveAsNew ? randomId() : candidate.id,
      name: candidate.name.trim(),
      updatedAt: Date.now(),
    };
    const list =
      candidateSaved && !saveAsNew
        ? designs.map((d) => (d.id === candidate.id ? next : d))
        : [next, ...designs];
    try {
      persist(next, list, next);
      setBaseline(next);
      setDraft(next);
      setDesigns(list);
      setSaveState("方案已保存");
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const guard = (
    run: (wasSaved?: boolean) => void,
    title = "离开当前方案？",
  ) => {
    if (!dirty) {
      run();
      return;
    }
    setConfirmation({
      title,
      body: "当前有未保存到方案库的修改。保存后继续，或放弃这些修改。",
      run,
      saveable: true,
    });
  };
  const applyLocation = (location: StudioLocation) => {
    setCatalogOpen(location.page === "catalog");
    setView(location.page === "catalog" ? "home" : location.page);
    setSkillsOrigin(location.skillsOrigin);
    currentUrl.current = window.location.href;
  };
  const navigate = (page: StudioPage, origin: SkillsOrigin = "home") => {
    pushStudioLocation(page, origin);
    applyLocation({ page, skillsOrigin: origin });
  };
  const cacheDraft = () => {
    if (!protectedStorage.current) {
      try { persist(draft, designs); setSaveState("草稿已缓存"); }
      catch { setSaveState("仅在内存"); }
    }
  };
  useEffect(() => {
    const restoreLocation = () => {
      if (view === "combat" && !window.confirm("离开当前模拟战斗？战斗进度不会保留。")) {
        window.history.pushState(null, "", currentUrl.current);
        return;
      }
      // Browser navigation retains the draft; flush before cancelling its debounce.
      if (!catalogOpen && (view === "editor" || view === "skills")) cacheDraft();
      setConfirmation(null);
      setTrial(null);
      applyLocation(readStudioLocation());
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  });
  const openSkills = (origin: SkillsOrigin) => navigate("skills", origin);
  const leaveSkills = (destination: SkillsOrigin) => {
    // Flush before leaving: the debounce is cancelled when returning to the menu.
    cacheDraft();
    navigate(destination);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-skills-entry]')?.focus());
  };
  const goHome = () =>
    guard((wasSaved) => {
      if (dirty && !wasSaved) {
        const restored = saved ?? baseline;
        open(restored);
        try {
          persist(restored, designs, restored);
        } catch {
          /* Retain the persistent warning. */
        }
      }
      navigate("home");
    }, "返回主页面？");
  const exportDesign = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (draft.name.replace(/[<>:"/\\|?*]/g, "-") || "ship") + ".design.json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const launch = () => {
    try {
      if (evaluation.errors.length) {
        setError(evaluation.errors.join("；"));
        return;
      }
      if (!protectedStorage.current) {
        try {
          persist(draft, designs);
        } catch {
          /* Use the in-memory draft without claiming it was saved. */
        }
      }
      const id = registerPrototype(draft);
      setTrial({ id, name: draft.name, key: Date.now(), deploymentCost: simulationHullCost(draft.hullId) });
      // Keep the launching screen URL: refresh must not create a new battle.
      setView("combat");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const clear = () =>
    setConfirmation({
      title: "清空装配？",
      body: "卸下所有非内置武器与可编辑插件，幅能容存器和耗散通道归零。保留内置装备；可以使用撤消恢复。",
      action: "清空装配",
      run: () => {
        let next = structuredClone(draft);
        for (const id of Object.keys(next.weapons))
          next = withWeapon(next, id, null);
        change({
          ...next,
          hullMods: [],
          sMods: [],
          capacitors: 0,
          vents: 0,
          updatedAt: Date.now(),
        });
      },
    });
  const loadNativeVariant = async (spec: Record<string, unknown>) => {
    try {
      const { importNativeVariant } = await import("./NativeVariantImport");
      const { design, warnings } = importNativeVariant(spec);
      const enter = () => { open(design); navigate("editor"); };
      guard(() => {
        if (warnings.length) setConfirmation({title: "以基础适配载入原版方案？", body: warnings.join("\n"), action: "载入并查看", run: enter});
        else enter();
      }, "载入原版装配方案？");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const undo = () => {
    const previous = history.at(-1);
    if (previous) {
      setDraft({ ...previous, updatedAt: Date.now() });
      setHistory((h) => h.slice(0, -1));
    }
  };
  const remove = (d: Design) =>
    setConfirmation({
      title: "删除方案？",
      body: "仅删除“" + d.name + "”的已保存副本，不删除当前草稿或舰船资源。",
      action: "删除方案",
      run: () => {
        const next = designs.filter((s) => s.id !== d.id);
        try {
          persist(draft, next);
          setDesigns(next);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (catalogOpen) return;
      if (
        (view === "editor" || view === "skills") &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        !confirmation
      ) {
        e.preventDefault();
        if (view === "skills" && document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        save();
      }

    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (view === "combat" && trial)
    return (
      <Suspense
        fallback={
          <div className="native-loading">
            准备模拟战斗...
            <NativeButton onClick={() => { setTrial(null); navigate("editor"); }}>
              返回改装
            </NativeButton>
          </div>
        }
      >
        <CombatView
          key={trial.key}
          prototypeId={trial.id}
          designName={trial.name}
          deploymentCost={trial.deploymentCost}
          onExit={() => {
            setTrial(null);
            navigate("editor");
          }}
        />
      </Suspense>
    );
  return (
    <>
      {catalogOpen ? (
        <Suspense fallback={<div className="native-loading">正在加载原版内容…</div>}>
          <NativeCatalog onVariant={loadNativeVariant} onClose={() => navigate("home")} onRefit={(id) => {
            const enter = () => { if (id !== draft.hullId) open(createDesign(id)); navigate("editor"); };
            if (id === draft.hullId) enter(); else guard(enter, "更换舰体？");
          }} />
        </Suspense>
      ) : view === "home" ? (
        <NativeHome {...homeNavigation} onEnter={() => navigate("editor")} onSkills={() => openSkills("home")} />
      ) : view === "skills" ? (
        <Suspense fallback={<div className="native-loading" role="status">正在准备角色技能…</div>}>
          <CaptainSkillsScreen value={draft.captainSkills ?? {}} profile={draft.captainProfile} designName={draft.name} hullName={data.ships[draft.hullId]?.name ?? draft.hullId}
            status={saveState} dirty={dirty} warning={storageWarning} backLabel={skillsOrigin === "home" ? "返回主菜单" : "返回改装"}
            onChange={captainSkills => change({ ...draft, captainSkills })}
            onProfileChange={captainProfile => change({ ...draft, captainProfile })}
            canUndo={history.length > 0} onUndo={undo} onImport={() => fileRef.current?.click()}
            onLaunch={launch} launchDisabledReason={evaluation.errors.length ? evaluation.errors.join("；") : null}
            onBack={() => leaveSkills(skillsOrigin)} onRefit={() => leaveSkills("editor")} onSave={save} onExport={exportDesign} />
        </Suspense>
      ) : (
        <NativeRefit
          key={editorKey}
          hullFilter={hullFilter}
          onHullFilter={setHullFilter}
          readHullScroll={readHullScroll}
          writeHullScroll={writeHullScroll}
          draft={draft}
          designs={designs}
          dirty={dirty}
          status={saveState}
          warning={storageWarning}
          canUndo={history.length > 0}
          onChange={change}
          onHull={(id) => {
            if (id !== draft.hullId)
              guard(() => open(createDesign(id)), "更换舰体？");
          }}
          onOpen={(d) => guard(() => open(d), "打开装配方案？")}
          onSave={save}
          onRename={(design, name) => {
            const trimmed = name.trim();
            if (!trimmed || trimmed.length > 48) {
              setError("方案名称需为 1–48 个字符。");
              return false;
            }
            const list = designs.map((d) =>
              d.id === design.id
                ? { ...d, name: trimmed, updatedAt: Date.now() }
                : d,
            );
            const nextDraft =
              draft.id === design.id ? { ...draft, name: trimmed } : draft;
            try {
              persist(nextDraft, list);
              setDraft(nextDraft);
              setDesigns(list);
              return true;
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              return false;
            }
          }}
          onCopy={() =>
            open({
              ...structuredClone(draft),
              id: randomId(),
              name: (draft.name + " · 副本").slice(0, 48),
              updatedAt: Date.now(),
            })
          }
          onNew={() =>
            guard(
              () => open(createDesign(draft.hullId, "empty")),
              "新建空白方案？",
            )
          }
          onDelete={remove}
          onExport={exportDesign}
          onImport={() => fileRef.current?.click()}
          onUndo={undo}
          onClear={clear}
          onLaunch={launch}
          onHome={goHome}
          onSkills={() => openSkills("editor")}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="导入舰船方案文件"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 1_000_000) throw new Error("方案文件超过 1 MB");
            const d = decodeDesign(JSON.parse(await file.text()));
            guard(
              () => open({ ...d, id: randomId() }),
              "导入舰船方案？",
            );
          } catch (err) {
            setError(
              "导入失败：" + (err instanceof Error ? err.message : String(err)),
            );
          }
        }}
      />
      {error && (
        <div className="native-error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      <MotionPresence>{confirmation && (
        <Modal
          title={confirmation.title}
          description={confirmation.body}
          eyebrow="舰队改装"
          width="small"
          onClose={() => setConfirmation(null)}
          footer={
            <>
              <NativeButton onClick={() => setConfirmation(null)}>
                取消
              </NativeButton>
              <NativeButton
                onClick={() => {
                  const run = confirmation.run;
                  setConfirmation(null);
                  run();
                }}
              >
                {confirmation.saveable
                  ? "放弃修改并继续"
                  : (confirmation.action ?? "确认")}
              </NativeButton>
              {confirmation.saveable && (
                <NativeButton
                  onClick={() => {
                    if (save()) {
                      const run = confirmation.run;
                      setConfirmation(null);
                      run(true);
                    }
                  }}
                >
                  保存并继续
                </NativeButton>
              )}
            </>
          }
        >
          <p className="native-modal-note">
            原作资源与已有游戏存档不会被修改。
          </p>
        </Modal>
      )}</MotionPresence>
    </>
  );
}
