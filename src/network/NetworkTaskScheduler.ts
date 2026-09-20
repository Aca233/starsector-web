/** A cancellable task (not a microtask) without nested setTimeout's 4ms clamp.
 * Shared ports exist only while work is pending; decoder credits bound callers.
 * Cancellation on reset/close drops the closure, not just its eventual result.
 * This improves scheduling opportunity, not a real-time deadline guarantee. */
let channel: MessageChannel | null = null;
let nextId = 0;
const tasks = new Map<number, () => void>();
function closeIfIdle(): void {
  if (tasks.size || !channel) return;
  channel.port1.close(); channel.port2.close(); channel = null;
}
export function scheduleNetworkTask(task: () => void): () => void {
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<number>) => {
      const callback = tasks.get(event.data);
      tasks.delete(event.data);
      try { callback?.(); } finally { closeIfIdle(); }
    };
  }
  const id = ++nextId;
  tasks.set(id, task);
  channel.port2.postMessage(id);
  return () => { tasks.delete(id); closeIfIdle(); };
}
