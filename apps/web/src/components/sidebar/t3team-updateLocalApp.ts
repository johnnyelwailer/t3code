import { downloadLocalUpdate, installLocalUpdate } from "./SidebarUpdatePill";

/** Downloads or installs only this app's update, through the pill's own download and install. */
export async function updateLocalApp(action: "download" | "install"): Promise<void> {
  const bridge = window.desktopBridge;
  if (!bridge) return;
  if (action === "download") {
    await downloadLocalUpdate(bridge, { notifyDownloaded: true });
    return;
  }
  await installLocalUpdate(bridge);
}
