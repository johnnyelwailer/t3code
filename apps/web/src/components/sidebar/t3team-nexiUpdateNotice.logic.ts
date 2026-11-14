import type { DesktopUpdateState } from "@t3tools/contracts";

import { plainReleaseNotes } from "./t3team-nexiUpdateNotes.logic";

export type NexiUpdateNoticeView = {
  readonly version: string;
  readonly title: string;
  readonly notes: ReadonlyArray<string>;
  readonly actionLabel: string;
  /** The feed's release page for this version; only an https page is ever offered as a link. */
  readonly releaseUrl: string | null;
};

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

/**
 * Whether the pill shows its dot and pops the notes on its own: the dot stays until the notes
 * were opened for this version; the automatic pop happens once per version.
 */
export function getUpdateNotesAttention(
  version: string | null,
  popped: string | null,
  seen: string | null,
): { readonly dot: boolean; readonly pop: boolean } {
  if (version === null) return { dot: false, pop: false };
  return { dot: seen !== version, pop: popped !== version && seen !== version };
}

/** A table entry's own update action, naming every running thread that action interrupts. */
export function updateEntryActionTitle(label: string, threads: number): string {
  if (threads === 0) return label;
  return `${label} · interrupts ${threads} running ${threads === 1 ? "thread" : "threads"}`;
}

/**
 * This app may host several machines, each its own table row. Its update action shows once, on
 * the first of them, and a restart interrupts the threads of all of them.
 */
export function appRestartScope<
  Row extends { readonly app: string | null; readonly environmentId: string | null },
>(
  rows: ReadonlyArray<Row>,
): { readonly actionRow: Row | null; readonly environmentIds: ReadonlyArray<string> } {
  const appRows = rows.filter((row) => row.app === "this-app");
  return {
    actionRow: appRows[0] ?? null,
    environmentIds: appRows.flatMap((row) =>
      row.environmentId === null ? [] : [row.environmentId],
    ),
  };
}
