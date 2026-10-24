/**
 * Which cloud session fits a project: the one rule the web client (a composer bound to a session)
 * and the server (a delegated child started on a session) share, so the two cannot disagree about
 * which machine is "this project's".
 *
 * A session fits in two stages. Before attaching, only the listed record is known: a session the
 * broker reaches, for the project's repository, with enough of its hold left
 * (`selectFittingCloudSession`). After attaching, the session's server reports its own project —
 * the one whose workspace root is that server's `cwd` (`ownProjectOnMachine`) — and that project
 * must be the same project (`isSameCloudSessionProject`). Ownership is not checked here: every
 * session list a caller has is already scoped to the signed-in user.
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

export type CloudSessionFit =
  | { readonly kind: "ready"; readonly session: CloudSession }
  | { readonly kind: "starting"; readonly session: CloudSession };

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

function remainingSecondsOf(session: FitSession, nowMs: number): number | null {
  const endsAtMs = session.endsAt === undefined ? Number.NaN : Date.parse(session.endsAt);
  if (Number.isFinite(endsAtMs)) return Math.floor((endsAtMs - nowMs) / 1000);
  return session.remainingSeconds;
}

const startedAtMs = (session: FitSession) =>
  session.startedAt === undefined ? 0 : Date.parse(session.startedAt) || 0;

/**
 * The listed session a project's work should go to, before attaching: reachable through the
 * broker, started for the project's repository (`name`), not past `minRemainingSeconds` of its
 * hold. A ready session wins (the one with the most hold left), else one still starting (the
 * newest); null means none fits and a new one is needed. A project without a repository never
 * matches a listed session, since a plain session's name does not identify its project.
 */
export function selectFittingCloudSession<S extends FitSession>(input: {
  readonly sessions: ReadonlyArray<S>;
  readonly repositoryName: string | null;
  readonly nowMs: number;
  readonly minRemainingSeconds?: number;
  readonly excludeSessionIds?: ReadonlyArray<string>;
}): { readonly kind: CloudSessionFit["kind"]; readonly session: S } | null {
  const repositoryName = input.repositoryName?.trim().toLowerCase() ?? "";
  if (repositoryName === "") return null;
  const minimum = input.minRemainingSeconds ?? CLOUD_SESSION_MIN_REMAINING_SECONDS;
  const excluded = new Set(input.excludeSessionIds ?? []);
  const candidates = input.sessions.filter(
    (session) =>
      !excluded.has(session.sessionId) &&
      session.transport === "nexi_broker" &&
      session.name?.trim().toLowerCase() === repositoryName,
  );
  const ready = candidates
    .filter((session) => session.phase === "ready" && Boolean(session.environmentId))
    .map((session) => ({ session, remaining: remainingSecondsOf(session, input.nowMs) }))
    .filter((entry) => entry.remaining === null || entry.remaining >= minimum)
    .toSorted(
      (left, right) =>
        (right.remaining ?? Number.MAX_SAFE_INTEGER) - (left.remaining ?? Number.MAX_SAFE_INTEGER),
    )[0];
  if (ready !== undefined) return { kind: "ready", session: ready.session };
  const starting = candidates
    .filter((session) => STARTING_PHASES.has(session.phase))
    .toSorted((left, right) => startedAtMs(right) - startedAtMs(left))[0];
  return starting === undefined ? null : { kind: "starting", session: starting };
}
