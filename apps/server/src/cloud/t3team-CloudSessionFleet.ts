import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import type { CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

/**
 * Where the cloud sessions' compute lives: the GitHub host, the repository
 * that owns the provisioning workflow, and the runner shape the user is shown.
 *
 * The defaults describe the Nexplore fleet. They are overridable by
 * environment variable for anyone pointing at a different repository.
 */

const DEFAULT_HOST = "nexplore.ghe.com";
const DEFAULT_OWNER = "hive";
const DEFAULT_REPO = "nx-nexi";
const DEFAULT_WORKFLOW_FILE_NAME = "session.yml";

/**
 * The fleet's runner shape, read from the live orchestrator rather than
 * guessed: `ubuntu-slim` VMs are 12288 MB across 4 cores.
 */
const DEFAULT_MACHINE_LABEL = "ubuntu-slim · 12 GB · 4 cores";

export interface CloudSessionFleetConfig {
  readonly repoRef: CloudSessionRepoRef;
  readonly machineLabel: string;
}

export const resolveFleetConfig = Effect.fn("cloud.session_service.fleet")(function* () {
  const repoRef: CloudSessionRepoRef = {
    host: yield* Config.String("T3CODE_CLOUD_SESSION_HOST").pipe(Config.withDefault(DEFAULT_HOST)),
    owner: yield* Config.String("T3CODE_CLOUD_SESSION_OWNER").pipe(
      Config.withDefault(DEFAULT_OWNER),
    ),
    repo: yield* Config.String("T3CODE_CLOUD_SESSION_REPO").pipe(Config.withDefault(DEFAULT_REPO)),
    workflowFileName: yield* Config.String("T3CODE_CLOUD_SESSION_WORKFLOW").pipe(
      Config.withDefault(DEFAULT_WORKFLOW_FILE_NAME),
    ),
  };
  const machineLabel = yield* Config.String("T3CODE_CLOUD_SESSION_MACHINE_LABEL").pipe(
    Config.withDefault(DEFAULT_MACHINE_LABEL),
  );
  return { repoRef, machineLabel } satisfies CloudSessionFleetConfig;
});

/**
 * The provider's page listing every run of the session workflow, filtered to
 * one login — the full history the client caps at a handful of rows. Built
 * from the fleet config because no single run's `html_url` names the workflow.
 */
export function workflowHistoryUrl(repoRef: CloudSessionRepoRef, login: string): string {
  const base = `https://${repoRef.host}/${repoRef.owner}/${repoRef.repo}/actions/workflows/${encodeURIComponent(repoRef.workflowFileName)}`;
  return `${base}?query=${encodeURIComponent(`actor:${login}`)}`;
}
