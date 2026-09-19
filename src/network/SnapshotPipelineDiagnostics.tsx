import type { FlowSample } from './SnapshotFlow.mjs';
const fields = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const hz = (v: unknown) => finite(v) ? v.toFixed(1) : '未知';
const seat = (v: unknown) => finite(v) && Number.isSafeInteger(v) ? String(v) : '未知';
/** Report measured stages, never infer a bottleneck from a single rate sample. */
export function SnapshotPipelineDiagnostics({ pipeline, ageMs, receivedHz, appliedHz, local }: {
  pipeline: unknown; ageMs: number | null; receivedHz: number | null; appliedHz: number | null; local?: FlowSample;
}) {
  const input = fields(pipeline), data = input.version === 1 ? input : {};
  const report = fields(data.authority), authority = fields(report.performance);
  const fresh = data.version === 1 && finite(ageMs) && ageMs <= 5000;
  const sourceAge = finite(report.knownAgeMs) && finite(ageMs) ? report.knownAgeMs + ageMs : null;
  const sourceFresh = fresh && report.stale !== true && sourceAge !== null && sourceAge <= 5000;
  const source = sourceFresh ? fields(fields(authority.flow).rates) : {};
  const ingress = fresh ? fields(fields(data.ingress).rates) : {};
  const receivers = Array.isArray(data.receivers) ? data.receivers.slice(0, 9) : [];
  return <section aria-label="快照全链路速率">
    <p>快照全链路（实测速率，不是目标值） · 心跳报告 {data.version !== 1 || !finite(ageMs) ? '尚未收到有效报告' : `${Math.round(ageMs)} ms（含往返保守计时）${fresh ? '' : '（已过期）'}`}<br />
      房主采样已知年龄 {sourceAge === null ? '未知' : `${Math.round(sourceAge)} ms${sourceFresh ? '' : '（已过期）'}`}</p>
    <p>房主模拟 {hz(source.simulated)} 步/秒 → 房主产出 {hz(source.produced)} 帧/秒 → 中转接收 {hz(ingress.received)} 帧/秒<br />
      房主发布等待解码 credit {hz(source.blocked)} 次/秒（是回调次数，不是丢帧数）</p>
    {local && <p>房主本机上传入队 {hz(local.rates.uploaded)} 帧/秒 · 上传准入跳过 {hz(local.rates.uploadSkipped)} 次/秒</p>}
    {receivers.map((r: unknown, i: number) => {
      const row = fields(r), rates = fresh ? fields(fields(row.stages).rates) : {};
      return <p key={i}>接收端 {seat(row.seat)}：中转发送入队 {hz(rates.queued)} 帧/秒 · socket 忙跳过 {hz(rates.skippedSocket)} 次/秒 · 消费窗口满跳过 {row.consumptionCredits === true ? `${hz(rates.skippedCredit)} 次/秒` : '未启用'} · 消费回执 {row.consumptionCredits === true ? `${hz(rates.consumed)} 次/秒` : '未启用'}</p>;
    })}
    <p>本端接收 {hz(receivedHz)} 帧/秒 → 本端还原 {hz(appliedHz)} 个状态端点/秒（不是渲染 FPS）</p>
    <p>各阶段使用自身时钟独立采样，短时数值不必相等；发送入队不等于已在线上传完。播放合并可能使还原次数少于接收次数。房主小报告沿用心跳，不依赖大快照，但仍可能被同一网络队列阻塞；已知年龄不包含无法单独测量的房主上行耗时，未知/过期不是 0。Steam 的传输 ACK 不算此处的 LAN 消费回执。</p>
  </section>;
}
