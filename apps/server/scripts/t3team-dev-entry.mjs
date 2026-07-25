#!/usr/bin/env node
import * as NodeChildProcess from "node:child_process";

// T3 Team is the product shell: the dev server always boots the T3 Team entrypoint.
const entry = "src/t3team-bin.ts";

console.log(`[server:dev] entry=${entry}`);

const child = NodeChildProcess.spawn(process.execPath, ["--watch", entry], {
  stdio: "inherit",
  env: process.env,
});

const forwardSignal = (signal) => {
  if (child.killed) return;
  child.kill(signal);
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
