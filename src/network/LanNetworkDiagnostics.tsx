// Keep unknown/old-server data explicitly unknown; never infer wire bytes or
// bandwidth from the uncompressed snapshot size or from a zero socket buffer.
type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown): string => numeric(value)?.toFixed(0) ?? '未知';
const ms = (value: unknown): string => numeric(value) === null ? '未知' : numeric(value)!.toFixed(1) + ' ms';
const kib = (value: unknown): string => numeric(value) === null ? '未知' : (numeric(value)! / 1024).toFixed(1) + ' KiB';
export function LanNetworkDiagnostics({ transport }: { transport: unknown }) {
  const data = fields(transport);
  if (data.mode !== 'lan-websocket') return null;
  const authority = fields(data.authority);
  const receivers = Array.isArray(data.receivers) ? data.receivers.slice(0, 9) : [];
  return <section aria-label="局域网传输诊断">
    <p>局域网 WebSocket · 中转已接收状态序号 {count(data.relaySeq)} · {data.role === 'host' ? '房主查看各接收端' : '当前接收端'}</p>
    <p>中转已接收房主 {count(authority.received)} 帧 · 最近上传包（未压缩）{kib(authority.lastBytes)} · 中转解码与校验 {ms(authority.receiveMs)}</p>
    {receivers.map((value, index) => {
      const receiver = fields(value), credits = fields(receiver.credits), network = fields(receiver.network), flow = fields(receiver.flow), delta = fields(receiver.delta);
      return <p key={index}>接收端 {count(receiver.seat)} · 远端连接压缩 {receiver.compression === true ? '已协商' : receiver.compression === false ? '未协商（本机回环通常不压缩）' : '未知'}<br />
        在途快照 {count(credits.inflight)}/{count(credits.capacity)} · 在途未压缩应用数据 {kib(credits.bytes)} · socket 待发 {kib(receiver.bufferedBytes)}<br />
        原生心跳最近 {ms(network.latestRttMs)} · 窗口 RTT 基线 {ms(network.baselineRttMs)} · 未用于扩窗的忙时采样 {count(network.busySamples)} 次<br />
        本连接已发 {count(flow.sent)} 帧 · 未发送状态跳过：socket 忙 {count(flow.skippedSocket)} / 消费窗口满 {count(flow.skippedCredit)} · 最近完整包（未压缩）{kib(flow.lastBytes)}<br />
        无损增量 {receiver.delta ? `已启用：全量 ${count(delta.full)} / 增量 ${count(delta.delta)}，增量前 ${kib(delta.originalBytes)} → 增量后 ${kib(delta.encodedBytes)}，CPU预算回退 ${count(delta.budgetFallbacks)} 次` : "未协商（本机回环/旧端保留全量）"}
      </p>;
    })}
    <p>沿用现有心跳采样；原生心跳只到浏览器网络端或桌面桥接，不代表画面呈现延迟。压缩已协商不代表每包都压缩；上述字节不是实际线上流量。socket 待发为 0 也不代表 TCP、桌面桥接或接收端没有积压。计数自本次连接建立累计。桌面 LAN I/O Worker 可用时在该 Worker 还原增量；不可用时回退主线程。</p>
  </section>;
}
