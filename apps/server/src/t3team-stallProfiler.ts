// @effect-diagnostics nodeBuiltinImport:off - a watchdog thread, outside any Effect runtime on purpose.
/**
 * Records what the server was doing when it stopped answering.
 *
 * The server's event loop answers every websocket ping. When something runs for seconds without
 * yielding (a synchronous native call, a huge synchronous query, a runaway loop) the app's
 * connection drops with "stopped responding" and reconnects, and nothing in the traces says why:
 * a span only ends when the work does, and the telemetry timers stop with the loop.
 *
 * A watchdog thread watches a heartbeat the main thread writes every 500 ms and keeps a
 * low-rate CPU profile running on the main thread (restarted every minute so it stays small).
 * When the heartbeat resumes after a stall of `stallMs` or more, the profile covering the stall is
 * written to `<directory>/stall-<time>-<ms>ms.cpuprofile` (open it in Chrome DevTools or any
 * `.cpuprofile` viewer): the blocked call is the frame the samples sit in.
 *
 * Never throws and never keeps the process alive; if the inspector is unavailable it does nothing.
 *
 * @module t3team-stallProfiler
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeWorkerThreads from "node:worker_threads";

const HEARTBEAT_MS = 500;
export const DEFAULT_STALL_MS = 4_000;
const DEFAULT_PROFILE_INTERVAL_US = 10_000;
const DEFAULT_MAX_FILES = 10;
/** The rolling profile is discarded and restarted this often when nothing stalled. */
const ROLL_MS = 60_000;

const WATCHDOG_SOURCE = `
const { workerData, parentPort } = require("node:worker_threads");
const inspector = require("node:inspector");
const fs = require("node:fs");
const path = require("node:path");
const { heartbeatBuffer, directory, stallMs, intervalUs, maxFiles, rollMs } = workerData;
const heartbeat = new Int32Array(heartbeatBuffer);

// Pending inspector replies do not keep a worker alive; without this it exits before they arrive.
setInterval(() => {}, 60000);

const session = new inspector.Session();
session.connectToMainThread();
const post = (method, params) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))),
  );

const startProfile = async () => {
  await post("Profiler.enable");
  await post("Profiler.setSamplingInterval", { interval: intervalUs });
  await post("Profiler.start");
};

const prune = () => {
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith("stall-") && name.endsWith(".cpuprofile"))
    .sort();
  for (const name of files.slice(0, Math.max(0, files.length - maxFiles))) {
    try { fs.unlinkSync(path.join(directory, name)); } catch {}
  }
};

let lastValue = Atomics.load(heartbeat, 0);
let lastChangeAt = Date.now();
let rolledAt = Date.now();
let stalled = false;
let busy = false;

const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const value = Atomics.load(heartbeat, 0);
    if (value !== lastValue) {
      lastValue = value;
      const stalledForMs = now - lastChangeAt;
      lastChangeAt = now;
      if (stalled) {
        stalled = false;
        const { profile } = await post("Profiler.stop");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = path.join(directory, "stall-" + stamp + "-" + stalledForMs + "ms.cpuprofile");
        fs.writeFileSync(file, JSON.stringify(profile));
        prune();
        parentPort.postMessage({ type: "stall", file, stalledForMs });
        await startProfile();
        rolledAt = Date.now();
      } else if (now - rolledAt >= rollMs) {
        await post("Profiler.stop");
        await startProfile();
        rolledAt = Date.now();
      }
    } else if (!stalled && now - lastChangeAt >= stallMs) {
      stalled = true;
    }
  } catch (error) {
    parentPort.postMessage({ type: "error", message: String(error && error.message || error) });
  } finally {
    busy = false;
  }
};

fs.mkdirSync(directory, { recursive: true });
startProfile().then(
  () => {
    parentPort.postMessage({ type: "ready" });
    setInterval(tick, 250);
  },
  (error) => parentPort.postMessage({ type: "unavailable", message: String(error && error.message || error) }),
);
`;

export type StallProfilerOptions = {
  /** Where profiles are written. */
  readonly directory: string;
  /** How long the heartbeat may be stale before it counts as a stall. */
  readonly stallMs?: number;
  readonly profileIntervalUs?: number;
  readonly maxFiles?: number;
  readonly rollMs?: number;
  readonly onStall?: (event: { readonly file: string; readonly stalledForMs: number }) => void;
  readonly onUnavailable?: (reason: string) => void;
};

export type StallProfiler = { readonly stop: () => void };

const NOOP: StallProfiler = { stop: () => undefined };

export function startStallProfiler(options: StallProfilerOptions): StallProfiler {
  try {
    NodeFS.mkdirSync(options.directory, { recursive: true });
    const heartbeatBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const heartbeat = new Int32Array(heartbeatBuffer);
    // @effect-diagnostics-next-line globalTimers:off - the heartbeat must keep running when the Effect runtime is stalled
    const beat = setInterval(() => Atomics.add(heartbeat, 0, 1), HEARTBEAT_MS);
    beat.unref();

    const worker = new NodeWorkerThreads.Worker(WATCHDOG_SOURCE, {
      eval: true,
      workerData: {
        heartbeatBuffer,
        directory: NodePath.resolve(options.directory),
        stallMs: options.stallMs ?? DEFAULT_STALL_MS,
        intervalUs: options.profileIntervalUs ?? DEFAULT_PROFILE_INTERVAL_US,
        maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
        rollMs: options.rollMs ?? ROLL_MS,
      },
    });
    worker.unref();
    worker.on("message", (message: { type: string; [key: string]: unknown }) => {
      if (message.type === "stall") {
        options.onStall?.({
          file: String(message.file),
          stalledForMs: Number(message.stalledForMs),
        });
      } else if (message.type === "unavailable" || message.type === "error") {
        options.onUnavailable?.(String(message.message));
      }
    });
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
