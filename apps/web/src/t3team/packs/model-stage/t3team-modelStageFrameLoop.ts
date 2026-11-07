/**
 * The frame loop of a `ModelStageScene`: one `requestAnimationFrame` chain that runs while the
 * stage is visible and has something moving, throttled to the tier's frame interval. A wake that
 * arrives during a frame (a clip change fires inside the mixer update) joins the chain being
 * scheduled instead of starting a second one.
 */
export interface FrameScheduler {
  readonly request: (callback: (now: number) => void) => number;
  readonly cancel: (id: number) => void;
}

const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

export class ModelStageFrameLoop {
  private running = false;
  private frame = 0;
  private last = 0;

  constructor(
    private readonly step: (deltaSeconds: number) => void,
    private readonly active: () => boolean,
    private readonly intervalMs: number,
    private readonly frames: FrameScheduler = browserFrames,
  ) {}

  setRunning(running: boolean) {
    this.running = running;
    if (running) {
      this.wake();
      return;
    }
    this.frames.cancel(this.frame);
    this.frame = 0;
    this.last = 0;
  }

  wake() {
    if (this.running && this.frame === 0) this.frame = this.frames.request(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (!this.running) return;
    if (this.last === 0 || now - this.last >= this.intervalMs - 1) {
      const delta = this.last === 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.step(delta);
    }
    if (this.active()) this.wake();
    else this.last = 0;
  };
}
