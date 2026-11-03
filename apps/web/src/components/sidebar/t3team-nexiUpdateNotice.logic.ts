import type { DesktopUpdateState } from "@t3tools/contracts";

import { plainReleaseNotes } from "./t3team-nexiUpdateNotes.logic";

export type NexiUpdateNoticeView = {
  readonly version: string;
  readonly title: string;
  readonly notes: ReadonlyArray<string>;
  readonly actionLabel: string;
};

/** The Nexi feed's downloaded update, whether or not the user already said Later to it. */
export function getNexiUpdateNoticeView(
  state: DesktopUpdateState | null,
): NexiUpdateNoticeView | null {
  if (!state || state.feed !== "nexi-ghe" || state.status !== "downloaded") return null;
  const version = state.downloadedVersion;
  if (version === null) return null;
  return {
    version,
    title: `Nexi Work ${version} is ready`,
    notes: plainReleaseNotes(state.releaseNotes.flatMap((note) => note.items)),
    actionLabel: "Install now",
  };
}
