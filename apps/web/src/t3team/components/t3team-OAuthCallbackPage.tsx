import { useEffect, useState } from "react";
import {
  broadcastAtlassianOAuthCallback,
  postAtlassianOAuthCallbackToOpener,
} from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";

/**
 * Where Atlassian returns after sign-in.
 *
 * The result is delivered two ways, because this page is not always a popup. It posts to its opener
 * when it has one, and broadcasts on a same-origin channel regardless — which is what carries the
 * result home when the user had to open the authorize URL in an ordinary tab because popups were
 * blocked. Both paths are idempotent, so sending both is safe.
 *
 * The window only closes itself when it actually has an opener; a tab the user opened by hand cannot
 * be closed by script, and pretending otherwise would leave them staring at a page that claims it is
 * about to disappear.
 */
export function OAuthCallbackPage() {
  const [canSelfClose, setCanSelfClose] = useState(true);

  useEffect(() => {
    const href = window.location.href;
    const deliveredToOpener = postAtlassianOAuthCallbackToOpener(href);
    broadcastAtlassianOAuthCallback(href);

    if (deliveredToOpener) {
      window.close();
      return;
    }
    setCanSelfClose(false);
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Signing you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {canSelfClose
            ? "You can close this window if it does not close automatically."
            : "You can close this tab and return to T3 Code."}
        </p>
      </div>
    </div>
  );
}
