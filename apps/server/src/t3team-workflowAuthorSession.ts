/**
 * The per-run AUTHOR session: the hidden agent conversation that writes (and later repairs) an
 * orchestration's source, keyed both by run and by the author's thread.
 *
 * Why a session and not a one-shot model call: the author needs tools (validate, launch, the live
 * model catalog), and a runtime failure after launch must go back to the SAME conversation — it
 * holds the context a context-free repair model never had (the incident: three "cannot fix"
 * answers in five seconds). The broker's `t3team.orchestration.run` handler consults this registry:
 * a call from a thread with a session is that session's SUBMISSION of source, not a new launch.
 *
 * `submit` is installed by whoever is currently waiting for source (the first authoring turn, or a
 * repair turn) and removed when that wait ends — a submission with nobody waiting is refused.
 *
 * Module-singleton on the same pattern as `t3team-childProviderCatalog.ts`: process-local, hot
 * state only; a server restart loses it, and a run whose author is gone falls back to the
 * context-free repair path with the generated reference.
 */
import type { ModelSelection } from "@t3tools/contracts";
import type { WorkflowRunIntent } from "@t3team/sdk";

import type { WorkflowSourceFinding } from "./t3team-workflowSourceCheck.ts";

export type WorkflowAuthorSubmitResult =
  | { readonly ok: true; readonly runId: string }
  | { readonly ok: false; readonly findings: ReadonlyArray<WorkflowSourceFinding> };

export interface WorkflowAuthorSession {
  readonly runId: string;
  readonly launchThreadId: string;
  readonly authorThreadId: string;
  /** The author's own model (the caller's instance at its declared default). */
  readonly authorModelSelection: ModelSelection;
  readonly intent: WorkflowRunIntent;
  /** Present while a turn is waiting for source. */
  submit: ((source: string) => Promise<WorkflowAuthorSubmitResult>) | undefined;
  /** Set once the author explicitly could not produce a fix; later repair attempts stop asking. */
  declined: boolean;
}

const byAuthorThread = new Map<string, WorkflowAuthorSession>();
const byRun = new Map<string, WorkflowAuthorSession>();

export function registerWorkflowAuthorSession(session: WorkflowAuthorSession): void {
  byAuthorThread.set(session.authorThreadId, session);
  byRun.set(session.runId, session);
}

export const workflowAuthorSessionForThread = (threadId: string) => byAuthorThread.get(threadId);

/** The author thread's deterministic id; it outlives the process-local registry. */
export const workflowAuthorThreadId = (runId: string): string => `${runId}:author`;
const AUTHOR_THREAD_SUFFIX = workflowAuthorThreadId("");

/**
 * Whether `threadId` is a hidden author thread: registered this uptime, or carrying the
 * deterministic id (a thread left from before a restart is still sandboxed, never trusted).
 */
export const isWorkflowAuthorThread = (threadId: string): boolean =>
  byAuthorThread.has(threadId) || threadId.endsWith(AUTHOR_THREAD_SUFFIX);
export const workflowAuthorSessionForRun = (runId: string) => byRun.get(runId);

/** Test seam. Sessions are otherwise kept for the process lifetime: a thread that once authored
 * must keep resolving as an author, so a late call is refused by name rather than treated as a
 * fresh launch from a thread that owns a project. */
export function resetWorkflowAuthorSessions(): void {
  byAuthorThread.clear();
  byRun.clear();
}
