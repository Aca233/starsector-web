import { lazy, Suspense, useEffect, useState } from "react";
import { preloadNativeUIFonts } from "./ui/native-fonts";
import { NativeHome } from "./studio/NativeHome";
import "./studio/studio.css";
const StudioApp = lazy(() => import("./studio/StudioApp").then(module => ({ default: module.StudioApp })));
const LanApp = lazy(() => import("./network/LanApp"));
const CombatView = lazy(() => import("./CombatView"));
export function App() {
  useEffect(() => { preloadNativeUIFonts(); }, []);
  const view = new URLSearchParams(window.location.search).get("view");
  const [studioRequested, setStudioRequested] = useState(view === "catalog");
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
  if (!studioRequested) return <NativeHome onEnter={() => setStudioRequested(true)} onLan={() => window.location.assign("?view=lan")} />;
  return (
    <Suspense fallback={<div className="native-loading" role="status">正在准备舰船设计…</div>}>
      <StudioApp initialView={view === "catalog" ? "home" : "editor"} />
    </Suspense>
  );
}
export default App;
