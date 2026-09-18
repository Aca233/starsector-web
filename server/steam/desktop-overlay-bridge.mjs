/** Narrow, correlated IPC between the owned Steam service and its Electron window. */
export class DesktopOverlayBridge {
  constructor(send, initial, timeoutMs = 8000) {
    this.send = send; this.current = initial; this.timeoutMs = timeoutMs;
    this.pending = new Map(); this.sequence = 0; this.closed = false;
  }
  status() { return this.current ?? { supported: true, available: false, reason: '正在检测桌面 Steam 浮层…' }; }
  receive(message) {
    if (this.closed) return;
    if (message?.type === 'steam-overlay-state') { this.current = message.overlay; return; }
    if (message?.type !== 'steam-invite-result') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(Error(message.error));
    else pending.resolve(message.result);
  }
  invite(lobby, owner) {
    if (this.closed) return Promise.reject(Error('桌面服务已停止'));
    if (this.pending.size) return Promise.reject(Error('正在打开 Steam 邀请，请稍候'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(Error('桌面 Steam 浮层未响应，请重试或复制房间号邀请'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ type: 'steam-invite', id, lobby, owner }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  close() {
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(Error('桌面服务已停止')); }
    this.pending.clear();
  }
}
