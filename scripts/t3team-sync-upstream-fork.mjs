#!/usr/bin/env node

import { runSyncUpstreamCommand } from "./lib/sync-upstream-core.mjs";
import { verifyCurrentContainsLastSynced } from "./lib/t3team-verifyLastSyncedUpstream.mjs";

try {
  // The pre-commit hook: judged against the last upstream point fork main synced, never the
  // local upstream ref, which moves ahead on every fetch.
  if (process.argv[2] !== "verify-current" || !verifyCurrentContainsLastSynced()) {
    runSyncUpstreamCommand(process.argv);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-upstream error: ${message}`);
  process.exit(1);
}
