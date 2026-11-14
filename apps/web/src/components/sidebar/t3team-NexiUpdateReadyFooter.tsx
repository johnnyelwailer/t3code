import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { openDesktopUpdateReleaseNotes } from "../desktopUpdate.toast";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuItem } from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { DesktopUpdateStatusIcon } from "./DesktopUpdateStatusIcon";
import { NexiUpdatePopoverView } from "./t3team-NexiUpdatePopoverView";
import { readKey, writeKey } from "./t3team-updateNoticeStorage";
import type { NexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";

const DISMISSED_KEY = "nexi.update.dismissedVersion";
const NOTIFIED_KEY = "nexi.update.notifiedVersion";

/** One OS notification per version, on top of the footer dot. */
function notifyOnce(version: string) {
  if (readKey(NOTIFIED_KEY) === version) return;
  writeKey(NOTIFIED_KEY, version);
  try {
    const notification = new Notification("Nexi Work update available", {
      body: `Version ${version} is ready to install.`,
    });
    notification.addEventListener("click", () => window.focus());
  } catch {
    // notifications unavailable or denied: the footer dot is still there
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
 * The footer icon for a downloaded Nexi update: a dot until the user says Later, which stays
 * dismissed until another version is downloaded. The icon itself stays so the update can still be
 * installed.
 */
export function NexiUpdateReadyFooter({ view }: { readonly view: NexiUpdateNoticeView }) {
  const [dismissed, setDismissed] = useState(() => readKey(DISMISSED_KEY));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const pending = dismissed !== view.version;

  const announce = pending ? view.version : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- raises the OS notification, outside React, once per version
  useEffect(() => {
    if (announce !== null) notifyOnce(announce);
  }, [announce]);

  // No try/finally: React Compiler skips a component that has one.
  const onAction = () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    setBusy(true);
    void bridge
      .installUpdate(view.version)
      .catch((error: unknown) => fail("Could not restart to install the update", error))
      .then(() => setBusy(false));
  };

  const onLater = () => {
    writeKey(DISMISSED_KEY, view.version);
    setDismissed(view.version);
    setOpen(false);
  };

  const label = `Nexi Work ${view.version} is ready to install`;
  return (
    <SidebarMenuItem className="ml-auto shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip disabled={open}>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={label}
                    data-testid="nexi-update-ready-icon"
                    data-pending={pending}
                    className={cn(
                      "inline-flex size-8 cursor-pointer items-center justify-center rounded-full outline-hidden ring-ring transition-colors focus-visible:ring-2 focus-visible:ring-inset hover:bg-sidebar-row-hover",
                      pending
                        ? "bg-sidebar-control-surface text-sidebar-foreground"
                        : "text-(--sidebar-icon-color) hover:text-sidebar-foreground",
                    )}
                  >
                    <DesktopUpdateStatusIcon status={pending ? "ready" : "downloaded"} />
                  </button>
                }
              />
            }
          />
          <TooltipPopup align="center" side="top">
            {label}
          </TooltipPopup>
        </Tooltip>
        <PopoverPopup side="top" align="end" padding="compact" width="sm">
          <NexiUpdatePopoverView
            view={view}
            busy={busy}
            onAction={onAction}
            onLater={onLater}
            onOpenHistory={(url) => void openDesktopUpdateReleaseNotes(window.desktopBridge, url)}
          />
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
