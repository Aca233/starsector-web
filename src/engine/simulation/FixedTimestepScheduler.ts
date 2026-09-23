/**
 * 逻辑帧与渲染帧双轨解耦调度器 (Fixed Timestep Scheduler with Sub-tick Interpolation)
 * 核心原理:
 * 1. 物理/逻辑循环以恒定步长 (固定 60Hz，即 16.666ms) 运行，保证所有碰撞、弹道、幅能与装甲衰减具有确定性。
 * 2. 渲染循环由浏览器屏幕刷新率 (如 144Hz / 240Hz) 驱动，通过 alpha 插值消除画面任何微抖动。
 * 3. 支持无损时间膨胀 (Phase Cloak 慢动作 / 战术暂停 / 2倍速快进)。
 */
export class FixedTimestepScheduler {
  public fixedDeltaTime: number; // 固定逻辑步长 (秒)，默认 1/60
  private accumulator = 0;
  private lastTime = 0;
  private maxFrameTime = 0.1; // 防螺旋掉帧保护上限 (100ms)
  
  public timeScale = 1.0; // 时间缩放倍率 (0.5x 慢放, 1.0x 正常, 2.0x 快进, 0 暂停)
  public simTicks = 0;
  public renderFrames = 0;
  public measuredTPS = 60; // 实际逻辑每秒执行次数
  public measuredFPS = 60; // 实际渲染每秒执行次数
  public measuredFrameBudgetPercent = 0; // JS simulation/render work as a share of observed frame time
  public alpha = 0; // 亚帧插值系数 [0, 1)
  public renderDeltaTime = 0; // clamped wall-clock seconds represented by the current render frame
  public backlogSeconds = 0; // scaled simulation time waiting after bounded catch-up
  /** Catch-up CPU slice. At least one due tick runs; unfinished time stays in backlog. */
  // Opt-in until authority leaves the UI thread: a short budget trades TPS for
  // more paints under overload. Never enable that tradeoff as a hidden speedup.
  public maxCatchUpWorkMs = Infinity;
  public catchUpYields = 0;
  /** Wall time rejected by maxFrameTime, distinct from scaled backlog-cap loss. */
  public clippedWallSeconds = 0;
  public observedWallSeconds = 0;
  public completedSimulationSeconds = 0;
  public droppedSimulationSeconds = 0; // only catastrophic backlog trimmed by the safety cap

  private tpsCounter = 0;
  private fpsCounter = 0;
  private secondTimer = 0;
  private workTimeAccumMs = 0;
  private clockRevision = 0;
  private pendingTick: Promise<void | false> | null = null;
  public lastTickError: unknown = null;

  constructor(targetHz = 60) {
    this.fixedDeltaTime = 1 / targetHz;
  }

  /** Rebase wall-clock scheduling without clearing long-lived simulation/performance counters. */
  public resync(now = performance.now() / 1000) {
    this.clockRevision++;
    this.lastTime = now;
    this.accumulator = 0;
    this.renderDeltaTime = 0;
    this.backlogSeconds = 0;
    this.fpsCounter = 0;
    this.tpsCounter = 0;
    this.secondTimer = 0;
    this.workTimeAccumMs = 0;
  }

  public reset(now = performance.now() / 1000) {
    this.resync(now);
    this.droppedSimulationSeconds = 0;
    this.clippedWallSeconds = this.observedWallSeconds = this.completedSimulationSeconds = 0;
    this.catchUpYields = 0;
  }

  /**
   * 主循环入口：通常在 requestAnimationFrame 回调中触发
   * @param now 当前时间戳 (秒)
   * @param onFixedTick 确定性逻辑帧回调 (dt)
   * @param onRenderFrame 渲染帧回调 (alpha 插值系数)
   */
  public update(
    now: number,
    onFixedTick: (dt: number) => void | false | Promise<void | false>,
    onRenderFrame: (alpha: number) => void
  ) {
    if (this.lastTime === 0) {
      this.lastTime = now;
      return;
    }

    const wallFrameTime = Math.max(0, now - this.lastTime);
    this.observedWallSeconds += wallFrameTime;
    let frameTime = wallFrameTime;
    this.lastTime = now;

    // 防止切标签页回来后巨量耗时引发死循环
    if (frameTime > this.maxFrameTime) {
      this.clippedWallSeconds += frameTime - this.maxFrameTime;
      frameTime = this.maxFrameTime;
    }
    this.renderDeltaTime = Math.max(0, frameTime);

    const tStart = performance.now();

    // 累加实际受时间流速影响的逻辑时间
    this.accumulator += frameTime * this.timeScale;

    // Consume a bounded number of ticks but preserve remaining scaled time.
    let steps = 0;
    const maxSubSteps = 8;
    const countTick = (result: void | false) => {
      if (result !== false) { this.simTicks++; this.tpsCounter++; this.completedSimulationSeconds += this.fixedDeltaTime; }
    };
    const drain = () => {
      while (!this.pendingTick && this.accumulator >= this.fixedDeltaTime && steps < maxSubSteps) {
        // Do not monopolize rAF with eight 30–100ms synchronous ticks. This is
        // pacing, not reduced simulation Hz: dt/order stay fixed and the existing
        // catastrophic backlog policy remains explicit in its own loss counter.
        if (steps > 0 && performance.now() - tStart >= this.maxCatchUpWorkMs) {
          this.catchUpYields++; break;
        }
        const revision = this.clockRevision;
        this.accumulator -= this.fixedDeltaTime;
        const result = onFixedTick(this.fixedDeltaTime);
        steps++;
        if (result instanceof Promise) {
          this.pendingTick = result;
          void result.then(completed => {
            if (this.pendingTick !== result) return;
            this.pendingTick = null;
            // Host discard resolves false. A true completion still represents a
            // real tick even if the presentation clock was rebased while waiting.
            countTick(completed);
            if (revision === this.clockRevision && completed !== false) drain();
          }, error => {
            if (this.pendingTick !== result) return;
            this.pendingTick = null;
            if (revision !== this.clockRevision) return;
            this.lastTickError = error;
            this.resync();
            console.error('Combat tick failed', error);
          });
          break;
        }
        countTick(result);
        if (result === false) { this.accumulator = 0; break; }
        if (revision !== this.clockRevision) break;
      }
      this.backlogSeconds = this.accumulator;
    };
    drain();

    // Clamp catastrophic backlog rather than dropping all accumulated time, and expose any loss.
    const maxBacklog = this.fixedDeltaTime * maxSubSteps;
    if (this.accumulator > maxBacklog) {
      this.droppedSimulationSeconds += this.accumulator - maxBacklog;
      this.accumulator = maxBacklog;
    }
    this.backlogSeconds = this.accumulator;

    // 计算亚帧插值系数: alpha = 剩余累加量 / 固定步长
    this.alpha = Math.max(0, Math.min(1.0, this.accumulator / this.fixedDeltaTime));

    // 触发渲染帧
    onRenderFrame(this.alpha);
    this.renderFrames++;

    const workElapsed = performance.now() - tStart;
    this.workTimeAccumMs += workElapsed;
    // Diagnostics use wall time, not the simulation's 100 ms catch-up limit.
    // Otherwise a one-frame-per-second tab is incorrectly reported as 10 FPS.
    this.fpsCounter++;
    this.secondTimer += wallFrameTime;
    if (this.secondTimer >= 1) {
      this.measuredFPS = Math.round(this.fpsCounter / this.secondTimer);
      this.measuredTPS = Math.round(this.tpsCounter / this.secondTimer);
      const totalElapsedMs = this.secondTimer * 1000;
      this.measuredFrameBudgetPercent = Math.round(Math.max(0, Math.min(1, this.workTimeAccumMs / totalElapsedMs)) * 100);
      this.workTimeAccumMs = 0;
      this.fpsCounter = 0;
      this.tpsCounter = 0;
      this.secondTimer = 0;
    }
  }
}
