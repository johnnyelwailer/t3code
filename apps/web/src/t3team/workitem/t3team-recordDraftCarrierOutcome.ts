/**
 * The ONE place a draft carrier's durable outcome is recorded.
 *
 * Accepting or dismissing a proposal has two halves. The CLIENT half moves the draft store to
 * `applied`/`discarded`, which stops the strip and the in-place diff offering it for the rest of the session.
 * The DURABLE half stamps the carrier message on its thread, so a RELOAD does not resurrect an
 * already-accepted rewrite and invite a second write to Jira — `isPendingT3TeamDraftCarrier`
 * (`t3team-useDraftMutationIngest`) filters settled carriers when the thread is re-ingested.
 *
 * Both halves matter and they fail differently, which is why the caller decides what a failure means:
 *
 * - On ACCEPT this is awaited INSIDE the accept action, so a failure lands the draft in `error` with a
 *   message. That is the right call — the body is already in Jira, and a write that landed but was not
 *   recorded is exactly the state that produces a duplicate write later, so it must be visible.
 * - On DISMISS it is fire-and-forget: nothing was written anywhere, and the local discard already did what
 *   the reader asked. A failed bookkeeping call must not turn "no thanks" into an error card.
 */

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";

export type T3TeamDraftCarrierOutcome = "applied" | "dismissed";

export const T3TEAM_DRAFT_STATUS_PATH = "/api/t3team/thread/draft-mutation/status";

export async function recordDraftCarrierOutcome(input: {
  readonly backend: BackendApi | null | undefined;
  readonly draft: T3TeamDraftMutation;
  readonly outcome: T3TeamDraftCarrierOutcome;
}): Promise<void> {
  const httpBaseUrl = input.backend?.httpBaseUrl;
  // The carrier lives on the thread that proposed it; without that there is nothing to address.
  if (!httpBaseUrl || !input.draft.sourceThreadId) {
    return;
  }

  const response = await fetch(`${httpBaseUrl}${T3TEAM_DRAFT_STATUS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId: input.draft.sourceThreadId,
      draftId: input.draft.id,
      status: input.outcome,
    }),
  });

  if (!response.ok) {
    // The route answers with a sentence naming the cause; surface it rather than a bare status code.
    const message = await readDraftStatusError(response);
    throw new Error(message);
  }
}

async function readDraftStatusError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } catch {
    // A non-JSON body is not worth a second failure mode.
  }
  return `Recording the draft verdict failed (${String(response.status)}).`;
}
