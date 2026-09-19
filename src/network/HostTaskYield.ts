/** Yield to the Worker task queue, not just the microtask queue. Promise.resolve
 * cannot admit input messages; nested setTimeout would add a 4ms timer clamp.
 * One reusable channel also avoids allocating/closing ports on each catch-up. */
let channel: MessageChannel | null = null;
const pending: Array<() => void> = [];
export function yieldHostTask(): Promise<void> {
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => pending.shift()?.();
  }
  return new Promise(resolve => {
    pending.push(resolve);
    channel!.port2.postMessage(null);
  });
}
