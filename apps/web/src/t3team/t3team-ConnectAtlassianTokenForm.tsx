import { ExternalLink } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";

const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

/**
 * The API-token fallback form for connecting Jira: site URL, email, and token, plus an
 * optional `Back` control to return to the OAuth-first default view. Kept separate from
 * `t3team-ConnectAtlassianStep.tsx` so both stay well under the additive-guard line cap.
 */
export function ConnectAtlassianTokenForm({
  siteUrl,
  email,
  apiToken,
  setSiteUrl,
  setEmail,
  setApiToken,
  canSubmit,
  submitting,
  onSubmit,
  onBack,
}: {
  siteUrl: string;
  email: string;
  apiToken: string;
  setSiteUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setApiToken: (value: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="space-y-3">
      <Input
        aria-label="Jira site URL"
        value={siteUrl}
        onChange={(event) => setSiteUrl(event.target.value)}
        placeholder="https://your-company.atlassian.net"
      />
      <Input
        aria-label="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
      />
      <Input
        aria-label="API token"
        type="password"
        value={apiToken}
        onChange={(event) => setApiToken(event.target.value)}
        placeholder="API token"
      />
      <a
        href={API_TOKEN_URL}
        target="_blank"
        rel="noreferrer external"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-3.5" />
        Get an API token from your Atlassian account
      </a>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onBack ? (
          <Button className="w-full sm:w-auto" variant="outline" onClick={onBack}>
            Back
          </Button>
        ) : null}
        <Button
          className="w-full justify-center gap-2 sm:w-auto"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? <Spinner className="size-4" /> : null}
          Connect with API token
        </Button>
      </div>
    </div>
  );
}
