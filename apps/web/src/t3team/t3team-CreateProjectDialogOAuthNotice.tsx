import { OAuthPopupBlockedNotice } from "~/t3team/components/t3team-OAuthPopupBlockedNotice";
import type { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";

/**
 * Carries the `oauth.state` projection the popup-blocked notice needs, so `CreateProjectDialog.tsx`
 * only has to render one component rather than derive `signinUrl`/`expired` itself. Covers both
 * causes that land here — a blocked popup, and one the user closed — both of which leave sign-in
 * waiting on a manual open rather than failed.
 */
export function CreateProjectDialogOAuthNotice({
  oauth,
}: {
  readonly oauth: ReturnType<typeof useAtlassianOAuth>;
}) {
  if (oauth.state.kind !== "needs_manual_open") return null;

  return (
    <OAuthPopupBlockedNotice
      signinUrl={oauth.state.signinUrl}
      expired={oauth.state.expired ?? false}
      onLinkUsed={() => {
        // Best effort: if minting a successor fails, the link just handed out is still valid, and
        // the next click simply retries this instead of surfacing a second error surface.
        oauth.mintFreshSigninLink().catch(() => {});
      }}
      onCancel={oauth.reset}
    />
  );
}
