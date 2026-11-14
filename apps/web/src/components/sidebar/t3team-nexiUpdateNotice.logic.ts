import type { DesktopUpdateState } from "@t3tools/contracts";

import {
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateReleaseUrl,
} from "../desktopUpdate.logic";
import { plainReleaseNotes } from "./t3team-nexiUpdateNotes.logic";

export type NexiUpdateNoticeView = {
  readonly version: string;
  readonly title: string;
  readonly notes: ReadonlyArray<string>;
  readonly actionLabel: string;
  /** The feed's release page for this version; only an https page is ever offered as a link. */
  readonly releaseUrl: string | null;
};

export type AppUpdateNotesView = Pick<NexiUpdateNoticeView, "notes" | "releaseUrl">;

function httpsPage(value: string | undefined): string | null {
  if (!value) return null;
  return URL.canParse(value) && new URL(value).protocol === "https:" ? value : null;
}

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
    releaseUrl: httpsPage(state.releaseUrl),
  };
}

/** What changed in the app update on offer, downloaded or not; null when nothing can be shown. */
export function getAppUpdateNotesView(state: DesktopUpdateState): AppUpdateNotesView | null {
  const version = getDesktopUpdateDownloadedVersion(state);
  if (version === null) return null;
  const notes = plainReleaseNotes(state.releaseNotes.flatMap((note) => note.items));
  const releaseUrl = httpsPage(state.releaseUrl) ?? getDesktopUpdateReleaseUrl(version);
  return notes.length === 0 && releaseUrl === null ? null : { notes, releaseUrl };
}
