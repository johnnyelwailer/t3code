import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { isDuplicateThreadCreateError } from "~/t3team/chat/t3team-duplicateThreadCreateError";
import { dispatchThreadBootstrapCreate } from "~/t3team/chat/t3team-runThreadBootstrapHelpers";
import type { ThreadBootstrapProgressTracker } from "~/t3team/chat/t3team-threadBootstrapProgress";
import type { ThreadBootstrapAction } from "~/t3team/chat/t3team-threadBootstrapInstrumentation";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";

export type DispatchThreadBootstrapCreateInput = {
  backend: BackendApi;
  action: ThreadBootstrapAction;
  state: ThreadBootstrapDispatchState;
  environmentId: string;
  threadId: string;
  canonicalProjectId: string;
  title: string;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  kickoffBranch: string | null;
  createdAt: string;
  /** Tracks the "create" step for the in-thread progress; optional for plain dispatches. */
  tracker?: ThreadBootstrapProgressTracker;
};

/**
 * Creates the durable server thread, tolerating a duplicate create (the shell already exists,
 * usually from a concurrent retry of the same kickoff). Reports the create step to the tracker.
 */
export async function dispatchThreadBootstrapCreateWithRecovery(
  input: DispatchThreadBootstrapCreateInput,
) {
  const { tracker, ...create } = input;
  tracker?.begin("create");
  try {
    await dispatchThreadBootstrapCreate(create);
    tracker?.complete("create");
  } catch (error) {
    if (!isDuplicateThreadCreateError(error)) {
      tracker?.fail("create", error);
      throw error;
    }
    tracker?.complete("create");
  }
}
