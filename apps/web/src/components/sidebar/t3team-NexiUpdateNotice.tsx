import { useEffect, useState } from "react";

import { isElectron } from "../../env";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { NexiUpdateNoticeView } from "./t3team-NexiUpdateNoticeView";
import { getNexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";

const DISMISSED_KEY = "nexi.update.dismissedVersion";
const NOTIFIED_KEY = "nexi.update.notifiedVersion";

const readKey = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeKey = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // best effort: the notice then simply comes back next start
  }
};

/** One OS notification per version, on top of the in-app notice. */
function notifyOnce(version: string) {
  if (readKey(NOTIFIED_KEY) === version) return;
  writeKey(NOTIFIED_KEY, version);
  try {
    const notification = new Notification("Nexi Work update available", {
      body: `Version ${version} is ready to install.`,
    });
    notification.addEventListener("click", () => window.focus());
  } catch {
    // notifications unavailable or denied: the in-app notice is still there
  }
}

const fail = (title: string, error: unknown) =>
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An unexpected error occurred.",
    }),
  );

/**
 * Ready-to-install updates stay dismissed until another version is downloaded.
 */
export function NexiUpdateNotice() {
  return isElectron ? <NexiUpdateNoticeContent /> : null;
}

function NexiUpdateNoticeContent() {
  const state = useDesktopUpdateState();
  const [dismissed, setDismissed] = useState(() => readKey(DISMISSED_KEY));
  const [busy, setBusy] = useState(false);
  const view = getNexiUpdateNoticeView(state, dismissed);

  const announce = view?.version ?? null;
  useEffect(() => {
    if (announce !== null) notifyOnce(announce);
  }, [announce]);

  if (!view) return null;

  // No try/finally: React Compiler skips a component that has one.
  const run = (work: () => Promise<unknown>, title: string) => {
    setBusy(true);
    void work()
      .catch((error: unknown) => fail(title, error))
      .then(() => setBusy(false));
  };

  const onAction = () => {
    const bridge = window.desktopBridge;
    if (bridge)
      run(() => bridge.installUpdate(view.version), "Could not restart to install the update");
  };

  return (
    <NexiUpdateNoticeView
      view={view}
      busy={busy}
      onAction={onAction}
      onLater={() => {
        writeKey(DISMISSED_KEY, view.version);
        setDismissed(view.version);
      }}
    />
  );
}
