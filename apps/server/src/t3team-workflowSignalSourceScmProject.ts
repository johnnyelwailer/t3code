/**
 * The `scm.project.items` poller: every issue and change request in the project's repositories.
 *
 * There was no lane to hang this on — nothing polls a project's GitHub issues — so it rides the
 * nearest one: the viewer source's search transport (`search/issues` over `GitHubApi`, which owns
 * the credential, the rate-limit pause and the GHE base URL) at the viewer source's cadence. One
 * incremental `updated:>=` search per host per poll covers every linked repository at once, so a
 * quiet poll costs one request per host and returns nothing. A refused or rate-limited page
 * (`failed`) holds the host's window, so nothing is skipped; it is re-read next poll.
 *
 * Scope is the project's repositories (`PullRequestService.projectRepositories`: its own remote and
 * its linked repositories), GitHub hosts only; the instance's `query` narrows it with search
 * qualifiers. The diff and the flood guard are in t3team-workflowSignalScmProjectDiff.ts.
 */
import { ScmProjectItemUpdated, type SignalSourceContext } from "@t3team/sdk";

import { isPersistenceSqlError } from "./persistence/Errors.ts";
import type { SearchPullRequestsRead } from "./t3team-githubViewerSearch.ts";
import {
  parseProjectItemsCursor,
  projectSearchSince,
  serializeProjectItemsCursor,
  settleProjectPoll,
  type ProjectHostRead,
} from "./t3team-workflowSignalScmProjectDiff.ts";
import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";

/** GitHub caps a search query's length; this many `repo:` qualifiers stay well under it. */
const REPOS_PER_QUERY = 8;
const FIRST_POLL_MS = 5_000;

export interface ScmProjectPorts {
  readonly projectRepositories: (
    projectId: string,
  ) => Promise<
    ReadonlyArray<{ readonly host: string; readonly repository: string; readonly provider: string }>
  >;
  readonly search: (input: {
    readonly host: string;
    readonly query: string;
  }) => Promise<SearchPullRequestsRead>;
  readonly nowIso: () => string;
}

/** `updated:` wants second precision without a fraction. */
const searchInstant = (iso: string) => iso.replace(/\.\d+Z$/, "Z");

export function projectSearchQueries(input: {
  readonly repositories: ReadonlyArray<string>;
  readonly since: string;
  readonly query: string | undefined;
}): ReadonlyArray<string> {
  const queries: string[] = [];
  for (let at = 0; at < input.repositories.length; at += REPOS_PER_QUERY) {
    const repos = input.repositories.slice(at, at + REPOS_PER_QUERY).map((repo) => `repo:${repo}`);
    queries.push(
      [...repos, `updated:>=${searchInstant(input.since)}`, input.query ?? ""].join(" ").trim(),
    );
  }
  return queries;
}

async function readHost(
  ports: ScmProjectPorts,
  host: string,
  repositories: ReadonlyArray<string>,
  since: string | null,
  query: string | undefined,
): Promise<ProjectHostRead> {
  // A baseline reads nothing: watching starts now, whatever happened before.
  if (since === null) return { host, items: [], complete: true };
  const reads = await Promise.all(
    projectSearchQueries({ repositories, since, query }).map((q) =>
      ports.search({ host, query: q }),
    ),
  );
  return {
    host,
    items: reads.flatMap((read) => read.items),
    complete: reads.every((read) => !read.failed && !read.truncated),
  };
}

export function startScmProjectSignalInstance(input: {
  readonly ctx: SignalSourceContext<{ projectId: string; query?: string | undefined }>;
  readonly ports: ScmProjectPorts;
  readonly pollMs: number;
  readonly log: (message: string, fields?: unknown) => void;
}): { readonly stop: () => void; readonly tick: () => Promise<void> } {
  const { ctx, ports, log } = input;
  const pollTimer = makeSignalPollTimer();
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const startedAt = ports.nowIso();
      const repositories = (await ports.projectRepositories(ctx.params.projectId)).filter(
        (repo) => repo.provider === "github",
      );
      const byHost = Map.groupBy(repositories, (repo) => repo.host);
      const prev = parseProjectItemsCursor(await ctx.getCursor());
      const reads = await Promise.all(
        [...byHost].map(([host, repos]) =>
          readHost(
            ports,
            host,
            repos.map((repo) => repo.repository),
            projectSearchSince(prev, host),
            ctx.params.query,
          ),
        ),
      );
      const { cursor, events } = settleProjectPoll(prev, reads, startedAt);
      for (const event of events) {
        try {
          await ctx.emit(ScmProjectItemUpdated, event.key, event.payload);
        } catch (error) {
          // A transient delivery fault holds the cursor so the events re-emit next poll.
          if (isPersistenceSqlError(error)) throw error;
          log("scm project signal emit rejected at the delivery boundary; skipping", {
            key: event.key,
            error: String(error),
          });
        }
      }
      await ctx.setCursor(serializeProjectItemsCursor(cursor));
    } catch (error) {
      log("scm project signal poll failed", { error: String(error) });
    } finally {
      if (!stopped) pollTimer.schedule(() => void tick(), input.pollMs);
    }
  };

  pollTimer.schedule(() => void tick(), Math.min(input.pollMs, FIRST_POLL_MS));
  return {
    tick,
    stop: () => {
      stopped = true;
      pollTimer.stop();
    },
  };
}
