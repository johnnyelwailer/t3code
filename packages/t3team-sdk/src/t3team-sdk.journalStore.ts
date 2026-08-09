/** T3Code adapter for the generic store seam, preserving the historical local-runs default. */

import * as NodeModule from "node:module";

export { createStoreSink, FsJournalStore } from "@runbook/core/journalStore";
export type { JournalSink, JournalStore } from "@runbook/core/journalStore";

const nodeRequire = NodeModule.createRequire(import.meta.url);
const path = nodeRequire("node:path") as {
  readonly join: (...parts: ReadonlyArray<string>) => string;
};
const proc = nodeRequire("node:process") as { readonly cwd: () => string };

/** Preserve T3Code's existing default path while the reusable core stays host-neutral. */
export function defaultRunsRoot(): string {
  return path.join(proc.cwd(), ".t3team-runs");
}
