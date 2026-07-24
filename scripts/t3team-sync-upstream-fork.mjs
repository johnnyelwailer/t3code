#!/usr/bin/env node

import { runSyncUpstreamCommand } from "./lib/sync-upstream-core.mjs";

try {
  runSyncUpstreamCommand(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-upstream error: ${message}`);
  process.exit(1);
}
