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

  private tpsCounter = 0;
  private fpsCounter = 0;
  private secondTimer = 0;
  private workTimeAccumMs = 0;

  constructor(targetHz = 60) {
    this.fixedDeltaTime = 1 / targetHz;
  }

  public reset(now = performance.now() / 1000) {
    this.lastTime = now;
    this.accumulator = 0;
  }

  /**
   * 主循环入口：通常在 requestAnimationFrame 回调中触发
   * @param now 当前时间戳 (秒)
   * @param onFixedTick 确定性逻辑帧回调 (dt)
   * @param onRenderFrame 渲染帧回调 (alpha 插值系数)
   */
  public update(
    now: number,
    onFixedTick: (dt: number) => void,
    onRenderFrame: (alpha: number) => void
  ) {
    if (this.lastTime === 0) {
      this.lastTime = now;
      return;
    }

    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // 防止切标签页回来后巨量耗时引发死循环
    if (frameTime > this.maxFrameTime) {
      frameTime = this.maxFrameTime;
    }

    // 统计 TPS / FPS 与真实 Idle 空闲率
    this.fpsCounter++;
    this.secondTimer += frameTime;
    if (this.secondTimer >= 1.0) {
      this.measuredFPS = this.fpsCounter;
      this.measuredTPS = this.tpsCounter;
      // Browser-main-thread work share. This is intentionally not labelled CPU/GPU idle time.
      const totalElapsedMs = this.secondTimer * 1000;
      this.measuredFrameBudgetPercent = Math.round(Math.max(0, Math.min(1, this.workTimeAccumMs / totalElapsedMs)) * 100);
      this.workTimeAccumMs = 0;
      this.fpsCounter = 0;
      this.tpsCounter = 0;
      this.secondTimer -= 1.0;
    }

    const tStart = performance.now();

    // 累加实际受时间流速影响的逻辑时间
    this.accumulator += frameTime * this.timeScale;

    // Consume a bounded number of ticks but preserve remaining scaled time.
    let steps = 0;
    const maxSubSteps = 8;
    while (this.accumulator >= this.fixedDeltaTime && steps < maxSubSteps) {
      onFixedTick(this.fixedDeltaTime);
      this.accumulator -= this.fixedDeltaTime;
      this.simTicks++;
      this.tpsCounter++;
      steps++;
    }

    // Clamp catastrophic backlog rather than dropping all accumulated time.
    const maxBacklog = this.fixedDeltaTime * maxSubSteps;
    this.accumulator = Math.min(this.accumulator, maxBacklog);

    // 计算亚帧插值系数: alpha = 剩余累加量 / 固定步长
    this.alpha = Math.max(0, Math.min(1.0, this.accumulator / this.fixedDeltaTime));

    // 触发渲染帧
    onRenderFrame(this.alpha);
    this.renderFrames++;

    const workElapsed = performance.now() - tStart;
    this.workTimeAccumMs += workElapsed;
  }
}
