import { useNavigate } from "@tanstack/react-router";
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
 * The interim update notice for Nexi Work: what is new, Install now or Later, and the states that
 * need the user (signed out of GHE, GHE unreachable, a download that failed verification).
 */
export function NexiUpdateNotice() {
  return isElectron ? <NexiUpdateNoticeContent /> : null;
}

function NexiUpdateNoticeContent() {
  const state = useDesktopUpdateState();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => readKey(DISMISSED_KEY));
  const [busy, setBusy] = useState(false);
  const view = getNexiUpdateNoticeView(state, dismissed);

  const announce = view?.kind === "available" ? view.version : null;
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
    if (!bridge || view.kind === "downloading") return;
    switch (view.action) {
      case "open-settings":
        void navigate({ to: "/settings/source-control" });
        return;
      case "retry":
        void run(
          () => (view.kind === "unreachable" ? bridge.checkForUpdate() : installNow(bridge)),
          "Could not check for updates",
        );
        return;
      case "install-now":
        void run(() => installNow(bridge), "Could not install the update");
        return;
      case "restart-now":
        void run(() => bridge.installUpdate(), "Could not restart to install the update");
        return;
    }
  };

  return (
    <NexiUpdateNoticeView
      view={view}
      busy={busy}
      onAction={onAction}
      onLater={() => {
        if (view.kind === "available" || view.kind === "downloaded") {
          writeKey(DISMISSED_KEY, view.version);
          setDismissed(view.version);
        }
      }}
    />
  );
}

/** Download, then restart into the new version; stops at the first step that does not complete. */
async function installNow(bridge: NonNullable<typeof window.desktopBridge>) {
  const download = await bridge.downloadUpdate();
  if (download.completed) await bridge.installUpdate();
}
