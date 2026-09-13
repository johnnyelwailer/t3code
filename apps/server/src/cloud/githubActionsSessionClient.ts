/**
 * Argv builders and response parsers for driving one cloud-session workflow
 * through the `gh` CLI.
 *
 * Pure on purpose: no I/O, no Effect, no network. The service layer owns
 * execution via `GitHubCli.execute`, which is how the rest of this repo talks
 * to GitHub (see `GitHubPullRequestCli`) — so a cloud session inherits the
 * user's existing `gh` login and needs no credential of its own.
 *
 * Vendor-named deliberately: the provisioning mechanics here genuinely are
 * GitHub Actions'. The neutral vocabulary lives one layer up, in the
 * `cloudSession` contract and `CloudSessionService`.
 */

export interface CloudSessionRepoRef {
  /** GitHub host, e.g. "nexplore.ghe.com". Passed to `gh --hostname`. */
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  /** Workflow file name, e.g. "session.yml". */
  readonly workflowFileName: string;
}

export interface WorkflowRunSummary {
  readonly id: number;
  readonly status: string;
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly htmlUrl: string;
}

export interface WorkflowJobStep {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

/** `gh api` reads a JSON body from stdin with `--input -`, keeping payloads out of argv. */
export interface GhInvocation {
  readonly args: ReadonlyArray<string>;
  readonly stdin?: string;
}

const apiArgs = (ref: CloudSessionRepoRef, path: string): ReadonlyArray<string> => [
  "api",
  "--hostname",
  ref.host,
  path,
];

export function dispatchSessionInvocation(
  ref: CloudSessionRepoRef,
  inputs: Readonly<Record<string, string>>,
): GhInvocation {
  return {
    args: [
      ...apiArgs(
        ref,
        `repos/${ref.owner}/${ref.repo}/actions/workflows/${ref.workflowFileName}/dispatches`,
      ),
      "--method",
      "POST",
      "--input",
      "-",
    ],
    // The endpoint answers 204 with an empty body; nothing to parse.
    stdin: JSON.stringify({ ref: "main", inputs }),
  };
}

export function listRunsInvocation(ref: CloudSessionRepoRef, limit: number): GhInvocation {
  return {
    args: apiArgs(
      ref,
      `repos/${ref.owner}/${ref.repo}/actions/workflows/${ref.workflowFileName}/runs?per_page=${limit}`,
    ),
  };
}

export function jobStepsInvocation(ref: CloudSessionRepoRef, runId: number): GhInvocation {
  return { args: apiArgs(ref, `repos/${ref.owner}/${ref.repo}/actions/runs/${runId}/jobs`) };
}

export function cancelRunInvocation(ref: CloudSessionRepoRef, runId: number): GhInvocation {
  return {
    args: [
      ...apiArgs(ref, `repos/${ref.owner}/${ref.repo}/actions/runs/${runId}/cancel`),
      "--method",
      "POST",
    ],
  };
}

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
  };
}

/**
 * Parse `GET /actions/workflows/{file}/runs`.
 *
 * Tolerant by design: this reads a remote API's response, and a shape we did
 * not expect should surface as "no sessions" rather than crash the list.
 */
export function parseRunsResponse(stdout: string): readonly WorkflowRunSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const runs = (parsed as { workflow_runs?: unknown }).workflow_runs;
  if (!Array.isArray(runs)) return [];
  return runs
    .filter((run): run is Record<string, unknown> => typeof run === "object" && run !== null)
    .map(toRun);
}

/**
 * Parse `GET /actions/runs/{id}/jobs`, flattening steps across jobs in order.
 *
 * The session workflow has exactly one job today, but step order is what phase
 * derivation reads, so the flattening must preserve it.
 */
export function parseJobStepsResponse(stdout: string): readonly WorkflowJobStep[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const jobs = (parsed as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];
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
