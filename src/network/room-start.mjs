import { roomDeploymentBlockReason } from "./room-deployment.mjs";
/** Shared lobby gate: only human guests ready; clicking Start is the host's confirmation. */
export function roomStartBlockReason({ status, hostId, members, aiHulls, options }) {
  if (!["lobby", "ended"].includes(status)) return status === "loading" ? "正在载入战斗，请稍候" : "本局正在进行";
  if (!members.some(member => member.id === hostId)) return "房主不在房间中";
  const offline = members.filter(member => !member.connected);
  if (offline.length) return "等待玩家重新连接：" + offline.map(member => member.name).join("、");
  const occupied = new Set([...members.map(member => member.team), ...aiHulls.flatMap((hulls,team)=>hulls.length ? [team] : [])]);
  if (occupied.size < 2) return "至少需要两个敌对阵营，请分队或添加独立 AI 对手；空队不参战";
  const editing = members.filter(member => member.editing);
  if (editing.length) return "等待玩家应用改装：" + editing.map(member => member.name).join("、");
  const deployment = options && roomDeploymentBlockReason(members, options);
  if (deployment) return deployment;
  const unready = members.filter(member => member.id !== hostId && !member.ready);
  if (unready.length) return "等待玩家准备：" + unready.map(member => member.name).join("、");
  return "";
}
