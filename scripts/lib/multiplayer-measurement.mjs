// Pure measurement helpers: never change game code or relax stress thresholds.
export function measuredSamples(samples, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw Error('Invalid measurement window');
  return samples.filter(s => s.event === 'sample' && Number.isFinite(s.wallTimeMs) && s.wallTimeMs >= start && s.wallTimeMs <= end);
}
export function summarizeStall(block, middle, late, acknowledgements) {
  const validWindow = Number.isFinite(block.startedAt) && Number.isFinite(block.finishedAt) &&
    block.startedAt <= middle.at && middle.at < late.at && late.at <= block.finishedAt;
  const rows = acknowledgements.filter(r => Number.isFinite(r.wallTimeMs) && Number.isSafeInteger(r.ack) && r.ack >= 0).toSorted((a,b)=>a.wallTimeMs-b.wallTimeMs);
  const before = rows.findLast(r => r.wallTimeMs <= block.startedAt);
  const during = rows.findLast(r => r.wallTimeMs >= middle.at && r.wallTimeMs <= late.at);
  return { mainBlockedMs: block.finishedAt - block.startedAt, actualBlock: block, middle, late, validWindow,
    publicationsDuringMiddle450ms: late.seq - middle.seq,
    guestAckBefore: before?.ack ?? null, guestAckDuring: during?.ack ?? null,
    guestAckObservedAt: during?.wallTimeMs ?? null,
    validAckProgress: validWindow && !!before && !!during && during.ack > before.ack };
}

/** Timestamp accepted relay publications as they occur, then cut the exact
 * browser-reported blocking interval. Playwright bindings/timers can be delayed
 * until after the blocking task, so they must not define this observation. */
export function recordedStall(block, publications, acknowledgements, trace) {
  const atStart = block.startedAt + 200, atEnd = atStart + 450;
  const seqAt = at => publications.findLast(p=>p.at<=at)?.seq ?? -1;
  const result = summarizeStall(block,{at:atStart,seq:seqAt(atStart)},{at:atEnd,seq:seqAt(atEnd)},acknowledgements);
  result.validWindow &&= trace.startedAt <= block.startedAt && trace.finishedAt >= block.finishedAt;
  result.validAckProgress &&= result.validWindow;
  // Count actual accepted packets, not sequence differences (skips are possible).
  result.publicationsDuringMiddle450ms = publications.filter(p=>p.at>atStart && p.at<=atEnd && !p.boundary).length;
  result.trace = trace;
  return result;
}
