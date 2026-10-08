/**
 * The broker's `launchThread` verbs (t3team-sdk.launchedThreads.ts): `thread.launch`,
 * `thread.launched` and `run.facts`. Each settles its resolver before `send` returns, so the
 * host's answer is the primitive's journaled reply and a replay never asks again. A refusal is
 * an answer too (`{ ok: false }`); so is a host failure, which the body sees as a
 * `LaunchedThreadError` and can retry on its next pass with a fresh journal position.
 *
 * Mode ceiling: a launched thread, and any later `configure`, stays within the run's own modes.
 */
import type { ModelSelection } from "@t3tools/contracts";
import type { ModelOption } from "@t3team/sdk";

import { resolveWorkflowChildModel } from "./t3team-workflowChildModel.ts";
import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import type {
  LaunchedThreadOpPayload,
  LaunchThreadPayload,
  RunFactsPayload,
} from "./t3team-workflowEngineBrokerPayloads.ts";
import { withinRunModes } from "./t3team-workflowLaunchedThreadIds.ts";
import type {
  WorkflowHostLaunchAnswer,
  WorkflowHostLaunchedThreadOp,
} from "./t3team-workflowHostPort.ts";

const LAUNCH_KINDS = new Set(["thread.launch", "thread.launched", "run.facts"]);

export const isBrokerLaunchVerb = (kind: string): boolean => LAUNCH_KINDS.has(kind);

const refused = (error: string): WorkflowHostLaunchAnswer<never> => ({ ok: false, error });

export async function handleBrokerLaunchVerb(core: BrokerCore, ctx: BrokerSend): Promise<void> {
  const { deps } = core;
  const settle = async (): Promise<WorkflowHostLaunchAnswer<unknown>> => {
    const host = deps.host;
    const scope = deps.launchScope ?? `run:${deps.runId}`;
    const owner = { runId: deps.runId, projectId: deps.projectId, scope };
    const model = (requested: ModelOption | undefined): Promise<ModelSelection> =>
      requested === undefined
        ? Promise.resolve(deps.modelSelection)
        : resolveWorkflowChildModel(deps.modelSelection, requested);

    if (ctx.kind === "run.facts") {
      const p = ctx.payload as RunFactsPayload;
      if (deps.launchThreadId === undefined) {
        return refused("A headless run has no thread to write facts on.");
      }
      return host.setRunFacts({ launchThreadId: deps.launchThreadId, extensions: p.extensions });
    }
    if (ctx.kind === "thread.launch") {
      const p = ctx.payload as LaunchThreadPayload;
      const modes = withinRunModes(deps, p);
      if ("refused" in modes) return refused(modes.refused);
      return host.launchThread({
        ...owner,
        key: p.key,
        ...(deps.launchThreadId === undefined ? {} : { launchThreadId: deps.launchThreadId }),
        title: p.title,
        ...(p.message === undefined ? {} : { message: p.message }),
        modelSelection: await model(p.model),
        runtimeMode: modes.runtimeMode,
        interactionMode: modes.interactionMode,
        workspace: p.workspace ?? { type: "root" },
      });
    }
    const p = ctx.payload as LaunchedThreadOpPayload;
    let op: WorkflowHostLaunchedThreadOp;
    if (p.op === "configure") {
      const modes = withinRunModes(deps, { runtimeMode: p.runtimeMode });
      if ("refused" in modes) return refused(modes.refused);
      op = {
        op: "configure",
        ...(p.model === undefined ? {} : { modelSelection: await model(p.model) }),
        ...(p.runtimeMode === undefined ? {} : { runtimeMode: modes.runtimeMode }),
      };
    } else {
      op = p;
    }
    return host.launchedThread({
      ...owner,
      key: p.key,
      threadId: p.threadId,
      requestId: ctx.correlationId,
      op,
    });
  };

  await core.runPrimitive(() =>
    core.enqueue(async () => {
      const answer = await settle().catch(
        (error: unknown): WorkflowHostLaunchAnswer<never> =>
          refused(error instanceof Error ? error.message : String(error)),
      );
      core.step(ctx.correlationId, ctx.kind, "completed", stepDetail(ctx));
      ctx.resolver.resolve(answer);
    }),
  );
}

function stepDetail(ctx: BrokerSend): string {
  const p = ctx.payload as { readonly key?: string; readonly op?: string; readonly title?: string };
  if (ctx.kind === "thread.launch") return `Launch thread — ${p.title ?? p.key ?? ""}`;
  if (ctx.kind === "run.facts") return "Update run facts";
  return `Launched thread ${p.key ?? ""} — ${p.op ?? ""}`;
}
