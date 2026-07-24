/**
 * WorkflowJournalStore - service tag wrapping the SDK's {@link JournalStore} seam.
 *
 * The durable-engine SDK writes its journal through a `JournalStore` (Epic 25 §Open
 * question 2). The host binds that seam to SQLite (see Layers/SqliteJournalStore.ts) so a
 * suspended run's journal lives in the same database as its run record — one durability
 * guarantee, no split-brain with the on-disk `.t3team-runs/`. The service value IS a
 * `JournalStore`; consumers (`launchWorkflowRecipe`, boot rehydration) resolve it and hand it
 * to `startWorkflow` / `resumeWorkflow` / `appendResolvedEntry`.
 *
 * @module WorkflowJournalStore
 */
import type { JournalStore } from "@t3team/sdk";
import * as Context from "effect/Context";

export class WorkflowJournalStore extends Context.Service<WorkflowJournalStore, JournalStore>()(
  "t3/persistence/Services/WorkflowJournalStore",
) {}
