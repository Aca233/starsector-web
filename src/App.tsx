import { steamRequest } from "./network/SteamApi";
import { lazy, Suspense, useEffect, useState } from "react";
import { preloadNativeUIFonts } from "./ui/native-fonts";
import { NativeHome } from "./studio/NativeHome";
import { pushStudioLocation, type StudioPage } from "./studio/StudioNavigation";
import "./studio/studio.css";
const StudioApp = lazy(() => import("./studio/StudioApp").then(module => ({ default: module.StudioApp })));
const LanApp = lazy(() => import("./network/LanApp"));
const WorkerLab = lazy(() => import("./worker-lab/WorkerLab"));
const CombatView = lazy(() => import("./CombatView"));
export function App() {
  useEffect(() => { preloadNativeUIFonts(); }, []);
  const [view] = useState(() => new URLSearchParams(window.location.search).get("view"));
  const [studioRequested, setStudioRequested] = useState(view === "catalog" || view === "skills" || view === "design");
  const [entryError, setEntryError] = useState("");
  const enterLan = async () => {
    try {
      const response = await fetch("/steam/status", { cache: "no-store" });
      if (response.ok && (await response.json()).service === "starsector-web-steam") {
        const result = await steamRequest<{url:string}>("lan"); window.location.assign(result.url); return;
      }
      window.location.assign("?view=lan");
    } catch (error) { setEntryError(error instanceof Error ? error.message : String(error)); }
  };
  const enterStudio = (page: StudioPage) => {
    pushStudioLocation(page);
    setStudioRequested(true);
  };
  if (view === "worker-lab") return <Suspense fallback={<div className="native-loading">正在准备双线程实验…</div>}><WorkerLab /></Suspense>;
  if (view === "steam") return <Suspense fallback={<div className="native-loading">正在准备 Steam 联机…</div>}><LanApp transport="steam" /></Suspense>;
  if (view === "lan") return <Suspense fallback={<div className="native-loading">正在准备局域网联机…</div>}><LanApp /></Suspense>;
  // Explicit existing developer entry points remain available; normal visits never start combat.
  if (view === "visual-lab" || view === "combat")
    return (
      <Suspense
        fallback={<div className="native-loading">正在准备战斗环境…</div>}
      >
        <CombatView />
      </Suspense>
    );
  if (!studioRequested) return <NativeHome onEnter={() => enterStudio("editor")} onSkills={() => enterStudio("skills")} entryError={entryError} onLan={() => void enterLan()} onSteam={() => window.location.assign("?view=steam")} />;
  return (
    <Suspense fallback={<div className="native-loading" role="status">正在准备舰船设计…</div>}>
      <StudioApp />
    </Suspense>
  );
}
export default App;
