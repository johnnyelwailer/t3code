#!/usr/bin/env node
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const mobileRoot = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const result = NodeChildProcess.spawnSync("tsc", ["--noEmit"], {
  cwd: mobileRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: ["--max-old-space-size=8192", process.env.NODE_OPTIONS].filter(Boolean).join(" "),
  },
});

process.exit(result.status ?? 1);
