/**
 * Response parsers for the cloud-session workflow's GitHub reads.
 *
 * Pure: a body string in, a value out. The request builders live beside this in
 * `t3team-githubActionsSessionClient.ts`; everything here only reads what one of them brought
 * back, so the two can be read and tested apart.
 *
 * Every parser answers `null` — never an empty value — for an unreadable body. That distinction
 * is load-bearing: an empty list is an authoritative "nothing is running", while "we could not
 * read this" must never be mistaken for it.
 */

import type { WorkflowJobStep, WorkflowRunSummary } from "./t3team-githubActionsSessionClient.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRun(raw: Record<string, unknown>): WorkflowRunSummary {
  return {
    id: typeof raw["id"] === "number" ? raw["id"] : 0,
    status: asString(raw["status"]),
    conclusion: asNullableString(raw["conclusion"]),
    createdAt: asString(raw["created_at"]),
    updatedAt: asString(raw["updated_at"]),
    htmlUrl: asString(raw["html_url"]),
    name: asString(raw["name"]) || asString(raw["display_title"]),
  };
}

/**
 * The `login` of `GET /user`; `null` when the answer is unreadable or carries none — the caller
 * must fail closed, never read a blank answer as "no sessions".
 */
export function parseLogin(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const login = (parsed as { login?: unknown }).login;
  return typeof login === "string" && login.trim() !== "" ? login.trim() : null;
}

/**
 * Parse `GET /actions/workflows/{file}/runs`.
 *
 * Returns `null` — never `[]` — when the response is not the shape we expect.
 * The distinction is load-bearing: an empty list is an authoritative "no
 * sessions", while unparseable output means we do not know. Collapsing the two
 * would let a truncated or error response read as "nothing is running", which
 * both hides live sessions and lets a stale run be mistaken for a new one.
 */
export function parseRunsResponse(body: string): readonly WorkflowRunSummary[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const runs = (parsed as { workflow_runs?: unknown }).workflow_runs;
  if (!Array.isArray(runs)) return null;
  return runs
    .filter((run): run is Record<string, unknown> => typeof run === "object" && run !== null)
    .map(toRun);
}

/**
 * Parse `GET /actions/runs/{id}/jobs`, flattening steps across jobs in order.
 *
 * The session workflow has exactly one job today, but step order is what phase
 * derivation reads, so the flattening must preserve it.
 *
 * `null` on an unreadable response, for the same reason as `parseRunsResponse`:
 * treating it as "no steps" would drag a running session's phase backwards to
 * `requested` on one flaky poll.
 */
export function parseJobStepsResponse(body: string): readonly WorkflowJobStep[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const jobs = (parsed as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((job) => {
    if (typeof job !== "object" || job === null) return [];
    const steps = (job as { steps?: unknown }).steps;
    if (!Array.isArray(steps)) return [];
    return steps
      .filter((step): step is Record<string, unknown> => typeof step === "object" && step !== null)
      .map((step) => ({
        name: asString(step["name"]),
        status: asString(step["status"]),
        conclusion: asNullableString(step["conclusion"]),
      }));
  });
}
