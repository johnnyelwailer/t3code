import { useState } from "react";

import { JiraNoticeCard } from "~/t3team/components/t3team-JiraNoticeCard";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import type { DigestJiraNotice } from "~/t3team/t3team-digestJiraNotice";

/**
 * The digest's notice for Jira data it cannot vouch for. A dead session swaps the card for the
 * sign-in panel (the same OAuth flow as onboarding); `onReload` then re-reads the digest, which is
 * also what retries a sync that stalled.
 */
export function DigestJiraNoticeCard({
  notice,
  onReload,
}: {
  readonly notice: DigestJiraNotice;
  readonly onReload: (() => void) | undefined;
}) {
  const [signingIn, setSigningIn] = useState(false);
  if (signingIn) {
    return (
      <JiraSignInPanel
        heading="Sign in to Jira again to refresh your tickets."
        onSignedIn={() => {
          setSigningIn(false);
          onReload?.();
        }}
      />
    );
  }
  return (
    <JiraNoticeCard
      lead={notice.lead}
      detail={notice.detail}
      actionLabel={notice.action === "sign-in" ? "Sign in again" : "Retry sync"}
      onAction={notice.action === "sign-in" ? () => setSigningIn(true) : () => onReload?.()}
    />
  );
}
