/**
 * The project-scope built-in sources' host entries: `scm.project.items` (issues and change requests
 * in the project's repositories) and `work-item.project-updates` (the project's Jira project, off
 * the backlog mirror). Both take `{ projectId, query? }`; their reads come in as ports, wired by
 * the reconciler (t3team-workflowSignalProjectPorts.ts) and replaced in tests.
 */
import { ProjectScopeParams, type SignalSourceContext } from "@t3team/sdk";

import { validateParams } from "./t3team-workflowSignalCatalogParams.ts";
import {
  startScmProjectSignalInstance,
  type ScmProjectPorts,
} from "./t3team-workflowSignalSourceScmProject.ts";
import {
  startWorkItemProjectSignalInstance,
  type WorkItemProjectPorts,
} from "./t3team-workflowSignalSourceWorkItemProject.ts";
import type { WorkflowSignalSourceHost } from "./t3team-workflowSignalCatalog.ts";

/** Both ride their lanes' cadence: the viewer search's 2 min, and about the mirror loop's 90 s. */
const SCM_PROJECT_POLL_MS = 120_000;
const WORK_ITEM_PROJECT_POLL_MS = 60_000;

export interface ProjectScopeHostPorts {
  readonly scmProject?: ScmProjectPorts | undefined;
  readonly workItemProject?: WorkItemProjectPorts | undefined;
}

function unwired(sourceName: string): never {
  throw new Error(
    `The '${sourceName}' source host was not given its reads; the reconciler wires them.`,
  );
}

export function makeProjectScopeHosts(input: {
  readonly ports: ProjectScopeHostPorts;
  readonly log: (message: string, fields?: unknown) => void;
  readonly scmPollMs?: number;
  readonly workItemPollMs?: number;
}): Readonly<Record<string, WorkflowSignalSourceHost>> {
  const start = async (sourceName: string, ctx: SignalSourceContext<unknown>) => {
    const params = await validateParams(ProjectScopeParams, ctx.params, sourceName);
    return { ...ctx, params };
  };
  return {
    "scm.project.items": {
      start: async (raw) => {
        const ctx = await start("scm.project.items", raw);
        return startScmProjectSignalInstance({
          ctx,
          ports: input.ports.scmProject ?? unwired("scm.project.items"),
          pollMs: input.scmPollMs ?? SCM_PROJECT_POLL_MS,
          log: input.log,
        });
      },
    },
    "work-item.project-updates": {
      start: async (raw) => {
        const ctx = await start("work-item.project-updates", raw);
        return startWorkItemProjectSignalInstance({
          ctx,
          ports: input.ports.workItemProject ?? unwired("work-item.project-updates"),
          pollMs: input.workItemPollMs ?? WORK_ITEM_PROJECT_POLL_MS,
          log: input.log,
        });
      },
    },
  };
}
