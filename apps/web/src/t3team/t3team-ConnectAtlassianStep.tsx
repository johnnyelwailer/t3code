import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { ATLASSIAN_OAUTH_UNCONFIGURED_ERROR } from "~/t3team/components/error/t3team-errorMessageRules";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { ConnectAtlassianTokenForm } from "~/t3team/t3team-ConnectAtlassianTokenForm";
import type { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";

/** Shared centred column so every sub-state of this step reads as the same screen. */
function ConnectAtlassianStepFrame({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-2 py-6">
      <div className="w-full max-w-sm">{children}</div>
    </section>
  );
}

function ConnectAtlassianMark() {
  return (
    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Link2 className="size-5" aria-hidden="true" />
    </div>
  );
}

/**
 * The wizard's "source" step. Jira has one first-class connection path — OAuth — with the
 * API-token form as a deliberately unemphasized fallback, revealed only on request. See
 * `docs/t3team-mvp/41-work-item-detail-redesign.md`-adjacent Atlassian wizard notes.
 */
export function ConnectAtlassianStep({
  loading,
  oauthConfigured,
  oauth,
  siteUrl,
  email,
  apiToken,
  setSiteUrl,
  setEmail,
  setApiToken,
  canConnectBasic,
  connectingBasic,
  onConnectBasic,
  initialShowTokenForm = false,
}: {
  loading: boolean;
  /** Whether an Atlassian OAuth client is configured for this environment. */
  oauthConfigured: boolean;
  oauth: ReturnType<typeof useAtlassianOAuth>;
  siteUrl: string;
  email: string;
  apiToken: string;
  setSiteUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setApiToken: (value: string) => void;
  canConnectBasic: boolean;
  connectingBasic: boolean;
  onConnectBasic: () => void;
  /** Storybook/testing hook for starting on the revealed token-form view. */
  initialShowTokenForm?: boolean;
}) {
  const [showTokenForm, setShowTokenForm] = useState(initialShowTokenForm);
  const oauthPending =
    oauth.state.kind === "opening" ||
    oauth.state.kind === "waiting" ||
    oauth.state.kind === "exchanging";

  if (loading) {
    return (
      <ConnectAtlassianStepFrame>
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-56 rounded-lg" />
        </div>
      </ConnectAtlassianStepFrame>
    );
  }

  const tokenForm = (
    <ConnectAtlassianTokenForm
      siteUrl={siteUrl}
      email={email}
      apiToken={apiToken}
      setSiteUrl={setSiteUrl}
      setEmail={setEmail}
      setApiToken={setApiToken}
      canSubmit={canConnectBasic}
      submitting={connectingBasic}
      onSubmit={onConnectBasic}
      {...(oauthConfigured ? { onBack: () => setShowTokenForm(false) } : {})}
    />
  );

  if (!oauthConfigured) {
    return (
      <ConnectAtlassianStepFrame>
        <div className="flex flex-col gap-5 text-left">
          <T3TeamErrorState error={ATLASSIAN_OAUTH_UNCONFIGURED_ERROR} />
          {tokenForm}
        </div>
      </ConnectAtlassianStepFrame>
    );
  }

  if (showTokenForm) {
    return (
      <ConnectAtlassianStepFrame>
        <div className="flex flex-col items-center gap-5">
          <ConnectAtlassianMark />
          <div className="w-full text-left">{tokenForm}</div>
        </div>
      </ConnectAtlassianStepFrame>
    );
  }

  return (
    <ConnectAtlassianStepFrame>
      <div className="flex flex-col items-center text-center">
        <ConnectAtlassianMark />
        <p className="mt-5 text-sm text-muted-foreground">
          Connect your Jira workspace to import projects and issues.
        </p>
        <Button
          className="mt-5 min-w-56 justify-center gap-2"
          onClick={() => void oauth.startOAuth()}
          disabled={oauthPending}
        >
          {oauthPending ? <Spinner className="size-4" /> : null}
          Continue with Atlassian
        </Button>
        <button
          type="button"
          aria-expanded={showTokenForm}
          onClick={() => setShowTokenForm(true)}
          className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Use an API token instead
        </button>
      </div>
    </ConnectAtlassianStepFrame>
  );
}
