/** Read-only rendering of the existing 2s localhost status poll. No extra SDK
 * query, network request, Steam identity, or lobby data is exposed here. */
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const num = (value: unknown, digits = 0) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toFixed(digits) : "未知";
const kb = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? (value / 1024).toFixed(1) + " KiB" : "未知";
const reasons: Record<string, string> = { "disconnected": "已断开", "frame-window": "等待网络 ACK（帧数）", "wire-byte-window": "等待网络 ACK（字节）", "renderer-consumption": "等待客机接纳状态", "shared-uplink-window": "共享上行额度不足" };
const reason = (value: unknown) => value == null ? "无" : typeof value === "string" && Object.hasOwn(reasons, value) ? reasons[value] : "未知";
function NativeQueue({ value }: { value: unknown }) {
  const s = record(value);
  if (s.available !== true) return <>SDK 队列不可测</>;
  return <>SDK 待发 {kb(s.queuedBytes)} / {num(s.queuedPackets)} 包 · Steam 中继 {s.usingRelay === true ? "是" : s.usingRelay === false ? "否" : "未知"}</>;
}
export function SteamNetworkDiagnostics({ transport }: { transport: unknown }) {
  const t = record(transport);
  if (t.mode !== "legacy-p2p") return null;
  const peers = Array.isArray(t.peers) ? t.peers.slice(0, 10).map(record) : [];
  const shared = record(t.sharedSnapshots), outbound = record(t.outbound);
  return <section aria-label="Steam 传输诊断">
    <p>Steam 默认可靠 P2P · {t.role === "host" ? "房主" : "客机"} · 约每 2 秒刷新；以下为传输统计，不是物理 Hz。</p>
    {t.role === "host" ? <>
      <p>共享在途 {kb(shared.inflightBytes)} / {kb(shared.limitBytes)} · 等待额度 {num(shared.waitingPeers)} 人</p>
      {peers.map((p, index) => {
        const packet = record(p.lastSnapshot), delta = record(p.delta);
        return <p key={index}>连接 {index + 1}：在途 {num(p.inflight)} / {num(p.window)} 帧 · {kb(p.inflightBytes)} · 最老 ACK {num(p.oldestAckMs)} ms<br />
          网络 ACK 均值 {num(p.ackMs)} ms · 路径基线 {num(p.baseAckMs)} ms · 当前门控：{reason(p.blockedBy)} · 最近跳过：{reason(p.lastSnapshotSkip)}<br />
          上次成功快照：完整 {kb(packet.rawBytes)} → 线上 {kb(packet.wireBytes)} / {num(packet.fragments)} 分片 · 网关准备 {num(packet.prepareMs, 1)} ms<br />
          累计全量 {num(delta.fullStates)} / 增量 {num(delta.deltaStates)} / 回退全量 {num(delta.legacyStates)} · <NativeQueue value={p.nativeSession} />
        </p>;
      })}
    </> : <p>Steam 网关累计接收 {num(t.receivedStates)} 帧 · 最近到包距今 {num(t.lastStateAgeMs)} ms<br />
      输入/控制在途 {num(outbound.inflight)} 条 · 等待发送 {num(outbound.queued)} 条 · 最老 ACK {num(outbound.oldestAckMs)} ms<br />
      <NativeQueue value={t.nativeHostSession} />
    </p>}
    <p>“线上”包含应用分片头，不含 Steam/IP 开销；ACK 在途额度按压缩负载计，不等于 SDK 待发。中继为“是”不代表它一定是瓶颈，不能直接据此关闭中继。</p>
  </section>;
}
