import type { useAccount } from "~/account/t3team-useAccounts";
import type { useJiraAccountStatuses } from "~/components/settings/t3team-useJiraAccountStatuses";

import { resolveWelcomeCheck } from "./t3team-welcomeCheck.logic";
import { useWelcomeCheckTimeout } from "./t3team-useWelcomeCheckTimeout";

/** The Nexplore read as a bounded check: pending past the timeout counts as failed. */
export function useWelcomeAccountCheck(account: ReturnType<typeof useAccount>) {
  const pending = !account.loaded && account.error === null;
  const { timedOut } = useWelcomeCheckTimeout(pending);
  return resolveWelcomeCheck({
    pending,
    failed: !account.loaded && account.error !== null,
    timedOut,
  });
}

export function useWelcomeJiraCheck(statuses: ReturnType<typeof useJiraAccountStatuses>) {
  const pending = statuses.state.kind === "loading";
  const { timedOut, restart } = useWelcomeCheckTimeout(pending);
  const jiraCheck = resolveWelcomeCheck({
    pending,
    failed: statuses.state.kind === "error",
    timedOut,
  });
  return {
    jiraCheck,
    retryJira: () => {
      restart();
      statuses.reload();
    },
  };
}
