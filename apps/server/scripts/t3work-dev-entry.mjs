#!/usr/bin/env node

import { spawn } from "node:child_process";

const rawMode = process.env.T3CODE_SERVER_MODE?.trim().toLowerCase();
const mode = rawMode === "classic" ? "classic" : "t3work";
const entry = mode === "classic" ? "src/bin.ts" : "src/t3work-bin.ts";

console.log(`[server:dev] mode=${mode} entry=${entry}`);

const child = spawn(process.execPath, ["--watch", entry], {
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
