import { useState } from "react";

import { getConnectSignInNoticeView } from "../../cloud/t3team-connectSignInNotice.logic";
import { useConnectSignIn } from "../../cloud/t3team-useConnectSignIn";
import { useClientSettings } from "../../hooks/useSettings";
import { toastManager } from "../ui/toast";
import { ConnectSignInPillView } from "./t3team-ConnectSignInPillView";

/**
 * A quiet "Sign in to T3 Connect" notice for a linked environment without the sign-in. The
 * browser opens only from this click; dismissing hides it until the next app start, and the
 * "T3 Connect sign-in reminder" setting hides it for good.
 */
export function SidebarConnectSignInPill() {
  const enabled = useClientSettings((settings) => settings.t3ConnectSignInNoticeEnabled);
  const { status, dismissed, canStart, start, dismiss } = useConnectSignIn();
  const [starting, setStarting] = useState(false);
  const view = getConnectSignInNoticeView(status, { enabled, dismissed });
  if (!view) return null;

  const onStart = () => {
    if (!view.startsSignIn || !canStart || starting) return;
    setStarting(true);
    start()
      .catch((error: unknown) =>
        toastManager.add({
          type: "error",
          title: "Could not start the T3 Connect sign-in",
          description: error instanceof Error ? error.message : undefined,
        }),
      )
      .finally(() => setStarting(false));
  };

  return (
    <ConnectSignInPillView
      view={view}
      busy={starting}
      canStart={canStart}
      onStart={onStart}
      onDismiss={dismiss}
    />
  );
}
