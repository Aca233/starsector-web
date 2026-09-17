import { randomId } from "../shared/RandomId";
import { validateLanDesign } from "./LanDesign";
import type { Design } from "../studio/DesignModel";
import type { LanConnection } from "./protocol";

/** Only a matching server receipt confirms a submission; room broadcasts alone do not. */
export function submitLanDesign(connection: LanConnection, roomCode: string, baseRevision: number, draft: Design, signal?: AbortSignal): Promise<Design> {
  const design = validateLanDesign(draft);
  return new Promise((resolve, reject) => {
    if (!connection.ready || signal?.aborted) { reject(Error("连接尚未就绪，草稿已保留")); return; }
    const requestId = randomId();
    let done = false;
    const finish = (error?: Error, acknowledged?: Design) => {
      if (done) return;
      done = true; clearTimeout(timer); unsubscribe(); signal?.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve(acknowledged!);
    };
    const aborted = () => finish(Error("提交已取消，未确认的草稿不会被标为已同步"));
    const unsubscribe = connection.subscribe(message => {
      if (message.type === "configured" && message.requestId === requestId) {
        try {
          if (message.roomCode !== roomCode || !Number.isSafeInteger(message.revision) || message.revision <= baseRevision || message.hull !== design.hullId) throw Error("配装确认不匹配，请重试");
          finish(undefined, validateLanDesign(message.design));
        } catch (error) { finish(error instanceof Error ? error : Error("配装确认无效")); }
      } else if (message.type === "error" && message.requestId === requestId) finish(Error(message.message));
      else if (["reconnecting", "disconnected", "roomClosed", "left", "match"].includes(message.type)) finish(Error("连接或房间状态已改变，尚未确认同步；草稿已保留"));
    });
    const timer = setTimeout(() => finish(Error("10 秒内未收到配装确认，草稿已保留，请检查连接后重试")), 10000);
    signal?.addEventListener("abort", aborted, { once: true });
    if (!connection.send({ type:"configure", requestId, roomCode, baseRevision, hull:design.hullId, design })) finish(Error("配装未能发送，草稿已保留"));
  });
}
