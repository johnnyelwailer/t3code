import type { DesktopUpdateState } from "@t3tools/contracts";

import { ensureLocalApi } from "../../localApi";
import { getDesktopUpdateInstallConfirmationMessage } from "../desktopUpdate.logic";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { downloadLocalUpdate, installLocalUpdate } from "./SidebarUpdatePill";

async function confirmInstall(state: DesktopUpdateState): Promise<boolean> {
  try {
    return await ensureLocalApi().dialogs.confirm(
      getDesktopUpdateInstallConfirmationMessage(state),
    );
  } catch (error) {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Could not confirm update",
        description: error instanceof Error ? error.message : "Update confirmation failed.",
      }),
    );
    return false;
  }
}

/**
 * Downloads or installs only this app's update, through the pill's own download and install.
 * `confirmed`: the user already confirmed in the update dialog, so no second prompt.
 */
export async function updateLocalApp(
  action: "download" | "install",
  state: DesktopUpdateState,
  { confirmed }: { readonly confirmed: boolean },
): Promise<void> {
  const bridge = window.desktopBridge;
  if (!bridge) return;
  if (action === "download") {
    await downloadLocalUpdate(bridge, { notifyDownloaded: true });
    return;
  }
  if (!confirmed && !(await confirmInstall(state))) return;
  await installLocalUpdate(bridge);
}
