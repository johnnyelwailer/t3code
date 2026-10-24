/**
 * Which cloud session fits a project. The own-project rules (`projectCwdOf`,
 * `ownProjectOnMachine`, `isSameCloudSessionProject`) and the tag name segment are shared by the
 * web composer and the server; the pre-attach selector is the server's (delegate_task). Every
 * session list is already scoped to the signed-in user, so ownership is not checked here.
 */
import {
  type CloudSession,
  plainProjectFolderName,
  type ProjectId,
  type RepositoryIdentity,
  repositoryGroupingKeyOf,
} from "@t3tools/contracts";

import { normalizeProjectPathForComparison } from "./path.ts";

export interface CloudSessionProjectFacts {
  readonly workspaceRoot: string;
  readonly repositoryIdentity?: RepositoryIdentity | null | undefined;
}

export type CloudSessionLocalProject = CloudSessionProjectFacts & {
  readonly id: ProjectId;
  readonly title: string;
};

/** A delegated child should not land on a machine that releases it within this many seconds. */
export const CLOUD_SESSION_MIN_REMAINING_SECONDS = 30 * 60;

const repositoryOf = (project: CloudSessionProjectFacts) =>
  project.repositoryIdentity ? repositoryGroupingKeyOf(project.repositoryIdentity) : null;

const folderOf = (workspaceRoot: string) =>
  normalizeProjectPathForComparison(workspaceRoot).split(/[\\/]/).pop() ?? "";

/** Whether the machine's own project can be the one a session was started for, for this project. */
export function isSameCloudSessionProject(
  local: CloudSessionLocalProject,
  own: CloudSessionProjectFacts,
): boolean {
  const localRepository = repositoryOf(local);
  const ownRepository = repositoryOf(own);
  if (localRepository === null) {
    return (
      ownRepository === null &&
      folderOf(own.workspaceRoot) === plainProjectFolderName(local.title, local.id)
    );
  }
  return ownRepository === null || ownRepository === localRepository;
}

/**
 * The working directory a server registers as its project, or null when it registers none there
 * (an older server, or one started without `--auto-bootstrap-project-from-cwd`).
 */
export function projectCwdOf(
  serverConfig: { readonly cwd?: string; readonly projectFromCwd?: boolean } | null | undefined,
): string | null {
  return serverConfig?.projectFromCwd === true && serverConfig.cwd ? serverConfig.cwd : null;
}

/** The machine's own project: the one at its server's registered working directory. */
export function ownProjectOnMachine<P extends { readonly workspaceRoot: string }>(
  serverCwd: string,
  projects: ReadonlyArray<P>,
): P | undefined {
  const root = normalizeProjectPathForComparison(serverCwd);
  return projects.find(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === root,
  );
}

type FitSession = Pick<
  CloudSession,
  | "sessionId"
  | "phase"
  | "name"
  | "transport"
  | "environmentId"
  | "endsAt"
  | "remainingSeconds"
  | "startedAt"
>;

const STARTING_PHASES = new Set<CloudSession["phase"]>([
  "requested",
  "queued",
  "preparing",
  "starting",
]);

const SESSION_NAME_LIMIT = 40;

/**
 * The name segment a session's correlation tag carries (`[<segment>.s<random>]`): anything outside
 * `[A-Za-z0-9_-]` becomes `-`, cut at 40 characters, no leading or trailing dashes. A listed
 * session's `name` is this segment, so a repository name is compared through it too.
 */
export function cloudSessionNameSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, SESSION_NAME_LIMIT)
    .replace(/^-+|-+$/g, "");
}

const comparableName = (value: string) => cloudSessionNameSegment(value.trim()).toLowerCase();

function remainingSecondsOf(session: FitSession, nowMs: number): number | null {
  const endsAtMs = session.endsAt === undefined ? Number.NaN : Date.parse(session.endsAt);
  if (Number.isFinite(endsAtMs)) return Math.floor((endsAtMs - nowMs) / 1000);
  return session.remainingSeconds;
}

const startedAtMs = (session: FitSession) =>
  session.startedAt === undefined ? 0 : Date.parse(session.startedAt) || 0;

const bySessionId = (left: FitSession, right: FitSession) =>
  left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0;

/**
 * The listed session a project's work should go to, before attaching. A listed session carries
 * only its name segment, the project's repository NAME (no host or owner: the broker's own
 * `repository` is the fleet repository the run executes in, not the project's), so `hive/app` and
 * `foo/app` are both candidates here. The owner-qualified check is the one after attaching:
 * `isSameCloudSessionProject` compares the session's own project by `repositoryGroupingKeyOf`,
 * and a session that fails it is passed back in `excludeSessionIds`.
 *
 * Ready with its environment linked and `minRemainingSeconds` of known hold left wins (most hold,
 * then session id); else the newest still starting, a ready one without its environment included.
 * Null: none fits. A project without a repository never matches a listed session.
 */
export function selectFittingCloudSession<S extends FitSession>(input: {
  readonly sessions: ReadonlyArray<S>;
  readonly repositoryName: string | null;
  readonly nowMs: number;
  readonly minRemainingSeconds?: number;
  readonly excludeSessionIds?: ReadonlyArray<string>;
}): { readonly kind: "ready" | "starting"; readonly session: S } | null {
  const repositoryName = input.repositoryName === null ? "" : comparableName(input.repositoryName);
  if (repositoryName === "") return null;
  const minimum = input.minRemainingSeconds ?? CLOUD_SESSION_MIN_REMAINING_SECONDS;
  const excluded = new Set(input.excludeSessionIds ?? []);
  const candidates = input.sessions.filter(
    (session) =>
      !excluded.has(session.sessionId) &&
      session.transport === "nexi_broker" &&
      session.name !== undefined &&
      comparableName(session.name) === repositoryName,
  );
  const ready = candidates
    .filter((session) => session.phase === "ready" && Boolean(session.environmentId))
    .flatMap((session) => {
      const remaining = remainingSecondsOf(session, input.nowMs);
      return remaining === null || remaining < minimum ? [] : [{ session, remaining }];
    })
    .sort(
      (left, right) => right.remaining - left.remaining || bySessionId(left.session, right.session),
    )[0];
  if (ready !== undefined) return { kind: "ready", session: ready.session };
  const starting = candidates
    .filter(
      (session) =>
        STARTING_PHASES.has(session.phase) || (session.phase === "ready" && !session.environmentId),
    )
    .sort((left, right) => startedAtMs(right) - startedAtMs(left) || bySessionId(left, right))[0];
  return starting === undefined ? null : { kind: "starting", session: starting };
}
