/**
 * Docks the thread's pending secret-use approvals above the composer. Answers go straight to the
 * server over the user's own connection; the agent waiting on them cannot answer them itself.
 */
import type {
  EnvironmentId,
  ThreadId,
  UserSecretApprovalDecision,
  UserSecretApprovalRequest,
} from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

import { T3TeamUserSecretApprovalCard } from "./t3team-UserSecretApprovalCard";

export function T3TeamUserSecretApprovalDock(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const approvals = useEnvironmentQuery(
    serverEnvironment.userSecretApprovals({
      environmentId: props.environmentId,
      input: { threadId: props.threadId },
    }),
  );
  const pending = approvals.data?.pending ?? [];
  if (pending.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {pending.map((request) => (
        <PendingApproval key={request.id} environmentId={props.environmentId} request={request} />
      ))}
    </div>
  );
}

function PendingApproval(props: {
  readonly environmentId: EnvironmentId;
  readonly request: UserSecretApprovalRequest;
}) {
  const answer = useAtomCommand(serverEnvironment.answerUserSecretApproval, {
    label: "answer user secret approval",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: UserSecretApprovalDecision) => {
    setBusy(true);
    setError(null);
    const result = await answer({
      environmentId: props.environmentId,
      input: { threadId: props.request.threadId, approvalId: props.request.id, decision },
    }).finally(() => setBusy(false));
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError("Could not send your answer. Try again.");
    }
  };

  return (
    <T3TeamUserSecretApprovalCard
      request={props.request}
      busy={busy}
      error={error}
      onDecide={(decision) => void decide(decision)}
    />
  );
}
