#!/usr/bin/env node
/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */

import * as NodeChildProcess from "node:child_process";

const rawMode = process.env.T3CODE_SERVER_MODE?.trim().toLowerCase();
const mode = rawMode === "classic" ? "classic" : "t3work";
const entry = mode === "classic" ? "src/bin.ts" : "src/t3work-bin.ts";

console.log(`[server:dev] mode=${mode} entry=${entry}`);

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
