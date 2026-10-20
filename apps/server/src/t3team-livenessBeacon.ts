// @effect-diagnostics nodeBuiltinImport:off - a beacon thread, outside any Effect runtime on purpose.
/**
 * Tells the desktop app "this process is alive, and here is how its event loop is doing", from a
 * thread the event loop cannot block.
 *
 * The desktop's health watchdog probes the backend over HTTP and kills it after ~30 s without an
 * answer. An HTTP probe cannot tell a dead backend from one whose event loop is busy for a few
 * seconds at a time, so a busy backend was killed and restarted in a loop (2026-10-19). Here a
 * worker thread watches a heartbeat the main thread bumps every 250 ms and writes one
 * `DesktopBackendLivenessBeacon` line per second to the desktop's liveness fd: how long the loop
 * has not turned now, and the longest such stall over the last 30 s. Beacons keep coming while the
 * loop is blocked and stop only when the whole process is frozen or gone.
 *
 * Never throws and never keeps the process alive. If the fd closes, the worker stops writing.
 *
 * @module t3team-livenessBeacon
 */
import * as NodeWorkerThreads from "node:worker_threads";

const HEARTBEAT_MS = 250;
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_WINDOW_MS = 30_000;

const BEACON_SOURCE = `
const { workerData } = require("node:worker_threads");
const fs = require("node:fs");
const { heartbeatBuffer, fd, intervalMs, windowMs, sampleMs } = workerData;
const heartbeat = new Int32Array(heartbeatBuffer);

let lastValue = Atomics.load(heartbeat, 0);
let lastTurnAt = Date.now();
let samples = [];

const sample = () => {
  const now = Date.now();
  const value = Atomics.load(heartbeat, 0);
  if (value !== lastValue) {
    lastValue = value;
    lastTurnAt = now;
  }
  const stalledForMs = now - lastTurnAt;
  samples.push([now, stalledForMs]);
  samples = samples.filter(([at]) => at >= now - windowMs);
  return stalledForMs;
};

const write = () => {
  const stalledForMs = sample();
  const maxStallMs = samples.reduce((max, [, stall]) => Math.max(max, stall), 0);
  const line = JSON.stringify({ version: 1, stalledForMs, maxStallMs }) + "\\n";
  try {
    fs.writeSync(fd, line);
  } catch {
    clearInterval(sampler);
    clearInterval(writer);
  }
};

const sampler = setInterval(sample, sampleMs);
const writer = setInterval(write, intervalMs);
write();
`;

export type LivenessBeaconOptions = {
  /** Where beacons are written: the desktop's liveness pipe. Without one there is no beacon. */
  readonly fd: number | undefined;
  readonly intervalMs?: number;
  readonly windowMs?: number;
  readonly onUnavailable?: (reason: string) => void;
};

export type LivenessBeacon = { readonly stop: () => void };

const NOOP: LivenessBeacon = { stop: () => undefined };

export function startLivenessBeacon(options: LivenessBeaconOptions): LivenessBeacon {
  if (options.fd === undefined) return NOOP;
  try {
    const heartbeatBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const heartbeat = new Int32Array(heartbeatBuffer);
    // @effect-diagnostics-next-line globalTimers:off - the heartbeat must keep running when the Effect runtime is stalled
    const beat = setInterval(() => Atomics.add(heartbeat, 0, 1), HEARTBEAT_MS);
    beat.unref();

    const worker = new NodeWorkerThreads.Worker(BEACON_SOURCE, {
      eval: true,
      workerData: {
        heartbeatBuffer,
        fd: options.fd,
        intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
        windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
        sampleMs: HEARTBEAT_MS,
      },
    });
    worker.unref();
    worker.on("error", (error) => options.onUnavailable?.(String(error.message)));
    return {
      stop: () => {
        clearInterval(beat);
        void worker.terminate();
      },
    };
  } catch (error) {
    options.onUnavailable?.(error instanceof Error ? error.message : String(error));
    return NOOP;
  }
}
