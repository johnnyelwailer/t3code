/**
 * The pure half of the `scm.viewer.change-requests` source (S5a): what the last poll saw (the
 * cursor), what this poll saw, and which events the difference is. The poller
 * (t3team-workflowSignalSourceScmViewer.ts) only does the reads and the delivery.
 *
 * Four rules keep a trigger from becoming a flood:
 *   • No cursor — missing, unreadable, or a version this code does not know — is a BASELINE: the
 *     poll records what it sees and emits nothing, so a lost cursor never replays a backlog.
 *   • A baseline taken while a host could not be read to the end (`pending`) is not finished for
 *     that host: it stays silent until one complete read of it, so PRs the failure or the 100-row
 *     cut-off hid are absorbed rather than launched when they surface.
 *   • An entry the read did not return is forgotten only when its host was read to the end. A host
 *     that failed or was cut off (`incompleteHosts`) keeps its entries, or its recovery would
 *     look like every PR being opened at once.
 *   • Detail is read only where an event could result (a new entry, a new review request, an
 *     authored PR that moved), so a quiet poll costs the searches and nothing else.
 */

import type { ScmViewerChangeRequestUpdatedPayload } from "@t3team/sdk";
import type { PullRequestDetail } from "@t3tools/contracts";

import type { ViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";

export type ViewerPrEntry = ViewerPrRead["entries"][number];
export type ViewerReason = ScmViewerChangeRequestUpdatedPayload["reason"];

/** `unlinked`: the project does not link this repository, so it is never read or emitted. */
type Scope = "linked" | "unlinked" | "unknown";

interface CursorEntry {
  readonly host: string;
  readonly updatedAt: string;
  readonly reviewRequested: boolean;
  readonly authored: boolean;
  readonly headSha: string | null;
  readonly scope: Scope;
}

export interface ViewerCursor {
  readonly v: 1;
  /** Hosts (or `"*"`: all) whose baseline was taken blind and is still being completed. */
  readonly pending?: ReadonlyArray<string>;
  readonly entries: Readonly<Record<string, CursorEntry>>;
}

/** What reading one entry's detail came to. A transient failure leaves the entry for next poll. */
export type DetailOutcome =
  | { readonly kind: "detail"; readonly detail: PullRequestDetail }
  | { readonly kind: "unlinked" }
  | { readonly kind: "failed" };

export interface ViewerEvent {
  readonly key: string;
  readonly payload: ScmViewerChangeRequestUpdatedPayload;
}

export const viewerEntryKey = (e: Pick<ViewerPrEntry, "host" | "repository" | "number">) =>
  `${e.host}:${e.repository}#${e.number}`;

/** A cursor this code can use, or null — which the poll treats as a baseline. */
export function parseViewerCursor(raw: string | null): ViewerCursor | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ViewerCursor> | null;
    const entries: unknown = value?.entries;
    return value?.v === 1 &&
      entries !== null &&
      typeof entries === "object" &&
      !Array.isArray(entries)
      ? (value as ViewerCursor)
      : null;
  } catch {
    return null;
  }
}

/** Whether `host` is still being baselined, so this poll learns its PRs but emits nothing. */
const isSilent = (prev: ViewerCursor | null, host: string): boolean =>
  prev === null || (prev.pending ?? []).some((h) => h === "*" || h === host);

/** The entries whose detail this poll must read. A baseline only learns authored PRs' heads. */
export function entriesNeedingDetail(
  prev: ViewerCursor | null,
  entries: ReadonlyArray<ViewerPrEntry>,
): ViewerPrEntry[] {
  return entries.filter((entry) => {
    const before = prev?.entries[viewerEntryKey(entry)];
    if (isSilent(prev, entry.host)) {
      return entry.viewerAuthored === true && (before === undefined || before.headSha === null);
    }
    if (before === undefined) return true;
    if (before.scope === "unlinked") return false;
    if (!before.reviewRequested && entry.viewerReviewRequested) return true;
    return (
      entry.viewerAuthored === true &&
      (before.updatedAt !== entry.updatedAt || before.headSha === null)
    );
  });
}

/** A detail read refused because the project does not link the repository (not a transient fault). */
export function isOutOfScopeError(error: unknown): boolean {
  const e = error as { _tag?: string; operation?: string; reason?: string } | null;
  return (
    (e?._tag === "PullRequestOperationError" && e.operation === "resolveRepository") ||
    (e?._tag === "PullRequestUnavailableError" && e.reason === "provider-unsupported")
  );
}

function reasonFor(
  entry: ViewerPrEntry,
  before: CursorEntry | undefined,
  detail: PullRequestDetail,
): ViewerReason | null {
  if (before === undefined) return entry.viewerReviewRequested ? "review-requested" : "opened";
  if (!before.reviewRequested && entry.viewerReviewRequested) return "review-requested";
  const moved = before.headSha !== null && detail.headSha !== undefined;
  return entry.viewerAuthored === true && moved && before.headSha !== detail.headSha
    ? "pushed"
    : null;
}

function toEvent(
  entry: ViewerPrEntry,
  detail: PullRequestDetail,
  reason: ViewerReason,
): ViewerEvent {
  return {
    key: viewerEntryKey(entry),
    payload: {
      changeRequest: {
        provider: detail.provider,
        host: entry.host,
        repository: entry.repository,
        number: entry.number,
        title: detail.title,
        url: detail.url,
        baseRef: detail.baseBranch,
        headRef: detail.headBranch,
        isDraft: detail.isDraft,
        // A host that cannot say a head's origin is treated as a fork, never as trusted.
        isCrossRepository: detail.isCrossRepository ?? true,
        ...(detail.authorAssociation === undefined
          ? {}
          : { authorAssociation: detail.authorAssociation }),
        viewerAuthored: entry.viewerAuthored === true,
      },
      ...(detail.headSha === undefined ? {} : { headSha: detail.headSha }),
      ...(detail.baseSha === undefined ? {} : { baseSha: detail.baseSha }),
      changedFiles: detail.changedFiles,
      additions: detail.additions,
      deletions: detail.deletions,
      reason,
    },
  };
}

/** Fold one poll into the next cursor and the events it earned. */
export function settleViewerPoll(
  prev: ViewerCursor | null,
  read: ViewerPrRead,
  outcomes: ReadonlyMap<string, DetailOutcome>,
): { readonly cursor: ViewerCursor; readonly events: ReadonlyArray<ViewerEvent> } {
  const entries: Record<string, CursorEntry> = {};
  const events: ViewerEvent[] = [];
  for (const entry of read.entries) {
    const key = viewerEntryKey(entry);
    const before = prev?.entries[key];
    const outcome = outcomes.get(key);
    // A failed read leaves the entry as it was (or out, when new), so whatever it would have
    // emitted is still pending next poll. On a baseline it is recorded without a head.
    const silent = isSilent(prev, entry.host);
    if (outcome?.kind === "failed" && !silent) {
      if (before !== undefined) entries[key] = before;
      continue;
    }
    const detail = outcome?.kind === "detail" ? outcome.detail : undefined;
    const reason = !silent && detail !== undefined ? reasonFor(entry, before, detail) : null;
    if (reason !== null && detail !== undefined) events.push(toEvent(entry, detail, reason));
    entries[key] = {
      host: entry.host,
      updatedAt: entry.updatedAt,
      reviewRequested: entry.viewerReviewRequested,
      authored: entry.viewerAuthored === true,
      headSha: detail?.headSha ?? before?.headSha ?? null,
      scope:
        outcome?.kind === "unlinked" ? "unlinked" : detail ? "linked" : (before?.scope ?? "unknown"),
    };
  }
  const blind = new Set(read.incompleteHosts);
  for (const [key, before] of Object.entries(prev?.entries ?? {})) {
    if (!(key in entries) && (blind.has("*") || blind.has(before.host))) entries[key] = before;
  }
  // Still blind where the baseline was blind; a complete read of a host settles it.
  const blindNow = (host: string) => blind.has("*") || blind.has(host);
  const was = prev?.pending ?? [];
  const pending =
    prev === null || was.includes("*") ? [...read.incompleteHosts] : was.filter(blindNow);
  return { cursor: { v: 1, ...(pending.length > 0 ? { pending } : {}), entries }, events };
}
