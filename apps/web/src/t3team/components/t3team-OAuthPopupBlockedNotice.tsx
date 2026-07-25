import { ExternalLink } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3team/components/ui/t3team-surface";

/**
 * Shown when the browser refused to open the sign-in window.
 *
 * Opening a window requires a user gesture the browser trusts, and several setups withhold one — a
 * strict popup blocker, an embedded webview, a click that arrived through a nested handler. The
 * previous behaviour was to fail with "Check your popup blocker settings", which left the user with
 * no way forward except changing browser settings. The authorize URL is perfectly usable as an
 * ordinary link, so offer it: a real click on an anchor is a gesture every browser honours.
 *
 * The sign-in is still being waited on while this is visible, and the result comes back over a
 * same-origin broadcast channel rather than through `window.opener` — which is why the link can carry
 * `rel="noreferrer"` (implying `noopener`) without breaking the flow. The opened page never gets a
 * handle on this one, and the result still arrives.
 */
export function OAuthPopupBlockedNotice({
  authorizeUrl,
  onCancel,
}: {
  readonly authorizeUrl: string;
  readonly onCancel?: (() => void) | undefined;
}) {
  return (
    <T3SurfaceCard tone="muted" role="status">
      <T3SurfaceCardContent className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Your browser blocked the sign-in window
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open it yourself and we&apos;ll pick up where you left off.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            render={<a href={authorizeUrl} target="_blank" rel="noreferrer external" />}
          >
            <ExternalLink className="size-3.5" />
            Sign in to Atlassian
          </Button>

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
