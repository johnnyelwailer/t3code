import { ExternalLink } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { CopyLinkButton } from "~/t3team/components/t3team-CopyLinkButton";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3team/components/ui/t3team-surface";

/**
 * Shown when sign-in has to be opened by the user rather than by us.
 *
 * Two causes reach here and the copy must be true of both: the browser refused the popup, or the user
 * closed it before finishing. It used to say "Your browser blocked the sign-in window", which asserts
 * a cause that is simply wrong in the second case — and the second case is the common one. Neither is
 * a failure: the user has not signed in yet, and the useful response is a link, not a red card.
 *
 * `signinUrl` is preferably the server-owned begin link, which is short and needs no prior session, so
 * it works in the browser the user is actually signed in to — including on their phone. It falls back
 * to the raw authorize URL, which can only be completed in this browser.
 *
 * The sign-in is still being waited on while this is visible. The result arrives over a same-origin
 * broadcast channel, or — when it finished somewhere this tab cannot see — by the server reporting a
 * new account. That is why the link can carry `rel="noreferrer"` (implying `noopener`) without
 * breaking anything: the opened page never needs a handle on this one.
 */
export function OAuthPopupBlockedNotice({
  signinUrl,
  onCancel,
}: {
  readonly signinUrl: string;
  readonly onCancel?: (() => void) | undefined;
}) {
  return (
    <T3SurfaceCard tone="muted" role="status">
      <T3SurfaceCardContent className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Finish signing in to Atlassian</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open the sign-in window again, or copy the link into the browser you&apos;re already
            signed in to.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            render={<a href={signinUrl} target="_blank" rel="noreferrer external" />}
          >
            <ExternalLink className="size-3.5" />
            Sign in to Atlassian
          </Button>

          <CopyLinkButton value={signinUrl} label="Copy sign-in link" />

          {onCancel ? (
            <Button size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
