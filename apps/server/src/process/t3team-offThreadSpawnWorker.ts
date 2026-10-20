/**
 * Source of the worker thread behind `t3team-offThreadChildProcessSpawner`.
 *
 * `child_process.spawn` is synchronous up to `CreateProcess`. On Windows with Defender for
 * Endpoint, launching an unsigned or newly built executable holds that call for a cloud
 * reputation check of up to ~10 s, so spawning it on the server's main thread freezes every
 * websocket ping for that long. The worker owns the child: its event loop absorbs the blocking
 * call, and the main thread only exchanges messages.
 *
 * Main -> worker: `spawn`, `stdin`, `stdinEnd`, `kill`.
 * Worker -> main: `spawned`, `stdout`/`stderr` (chunks transferred, not copied twice),
 * `stdoutEnd`/`stderrEnd`, `exit`, `error`.
 *
 * Plain CommonJS so it runs as an `eval` worker without a separate bundle entry.
 *
 * @module t3team-offThreadSpawnWorker
 */
export const OFF_THREAD_SPAWN_WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const { spawn } = require("node:child_process");
const children = new Map();

const post = (message, transfer) => parentPort.postMessage(message, transfer);
const describe = (error) => ({
  message: String((error && error.message) || error),
  code: error && typeof error.code === "string" ? error.code : undefined,
});

const forward = (id, stream, type) => {
  if (!stream) {
    post({ id, type: type + "End" });
    return;
  }
  stream.on("data", (chunk) => {
    const copy = new Uint8Array(chunk);
    post({ id, type, chunk: copy }, [copy.buffer]);
  });
  stream.on("end", () => post({ id, type: type + "End" }));
  stream.on("error", (error) => post({ id, type: "error", ...describe(error) }));
};

const start = (message) => {
  let child;
  try {
    child = spawn(message.command, message.args, message.options);
  } catch (error) {
    post({ id: message.id, type: "error", ...describe(error) });
    return;
  }
  children.set(message.id, child);
  child.on("spawn", () => post({ id: message.id, type: "spawned", pid: child.pid }));
  child.on("error", (error) => post({ id: message.id, type: "error", ...describe(error) }));
  child.on("exit", (code, signal) => {
    children.delete(message.id);
    post({ id: message.id, type: "exit", code, signal });
  });
  if (child.stdin) child.stdin.on("error", () => {});
  forward(message.id, child.stdout, "stdout");
  forward(message.id, child.stderr, "stderr");
};

parentPort.on("message", (message) => {
  if (message.op === "spawn") return start(message);
  const child = children.get(message.id);
  if (!child) return;
  if (message.op === "stdin" && child.stdin) child.stdin.write(message.chunk);
  else if (message.op === "stdinEnd" && child.stdin) child.stdin.end();
  else if (message.op === "kill") {
    try { child.kill(message.signal); } catch {}
  }
});
`;
