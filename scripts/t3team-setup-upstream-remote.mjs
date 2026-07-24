#!/usr/bin/env node

import { runSetupUpstreamCommand } from "./lib/sync-upstream-core.mjs";

try {
  runSetupUpstreamCommand();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`setup-upstream error: ${message}`);
  process.exit(1);
}
