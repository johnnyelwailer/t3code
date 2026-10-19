import * as Duration from "effect/Duration";

import type { BackendHealthWatchdogConfig } from "./t3team-backendHealthWatchdogConfig.ts";

/** Tracks watchdog kills across runs of one backend instance. */
export class BackendWatchdogKillHistory {
  private kills: Array<number> = [];
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private prune(config: BackendHealthWatchdogConfig): void {
    const cutoff = this.now() - Duration.toMillis(config.killWindow);
    this.kills = this.kills.filter((at) => at >= cutoff);
  }
  recordKill(): void {
    this.kills.push(this.now());
  }
  recentKills(config: BackendHealthWatchdogConfig): number {
    this.prune(config);
    return this.kills.length;
  }
  /** Warm-up doubles with every recent kill, capped at the kill window. */
  warmupFor(config: BackendHealthWatchdogConfig): Duration.Duration {
    const factor = 2 ** this.recentKills(config);
    return Duration.min(Duration.times(config.warmup, factor), config.killWindow);
  }
  mayKill(config: BackendHealthWatchdogConfig): boolean {
    return this.recentKills(config) < config.maxKillsPerWindow;
  }
}
