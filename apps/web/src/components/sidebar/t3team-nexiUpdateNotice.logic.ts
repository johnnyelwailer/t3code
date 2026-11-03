import type { DesktopUpdateState } from "@t3tools/contracts";

export type NexiUpdateNoticeView = {
  readonly kind: "downloaded";
  readonly version: string;
  readonly title: string;
  readonly notes: ReadonlyArray<string>;
  readonly action: "restart-now";
  readonly actionLabel: string;
  readonly dismissible: true;
};

export function getNexiUpdateNoticeView(
  state: DesktopUpdateState | null,
  dismissedVersion: string | null,
): NexiUpdateNoticeView | null {
  if (!state || state.feed !== "nexi-ghe" || state.status !== "downloaded") return null;
  const version = state.downloadedVersion;
  if (version === null || version === dismissedVersion) return null;
  return {
    kind: "downloaded",
    version,
    title: `Nexi Work ${version} is ready`,
    notes: state.releaseNotes.flatMap((note) => note.items).slice(0, 4),
    action: "restart-now",
    actionLabel: "Restart now",
    dismissible: true,
  };
}
