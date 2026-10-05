/**
 * Pack-registered delegated-completion wake renderer (`defineCompletionWakeRenderer`,
 * capability `completion-wake-renderer:v1`).
 *
 * `packCompletionWakeRendererLive` overrides the `DelegatedCompletionWakeRenderer` reference
 * consulted by the V2 continuation worker: with a registered renderer it reads the parent
 * thread's delegated tasks from the projection (read-only, lock-free) and lets the pack write the
 * wake; without one it keeps the host's default text. A slow, failing or empty render falls back
 * to the default text.
 *
 * @module t3team-pack-completionWakeRenderer
 */
import type { CompletionWakeRendererDefinition, CompletionWakeTask } from "@t3team/pack-api";
import { activateWorkspacePack } from "@t3team/packs";
import type { OrchestrationV2Subagent } from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProjectionStoreV2 } from "./orchestration-v2/ProjectionStore.ts";
import {
  DelegatedCompletionWakeRenderer,
  type DelegatedCompletionWakeInput,
} from "./t3team-v2/t3team-delegatedCompletionWakeRenderer.ts";
import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

const CAPABILITY = "completion-wake-renderer:v1";

class PackWakeRenderEmptyError extends Data.TaggedError("PackWakeRenderEmptyError")<{}> {}
const RENDER_TIMEOUT = Duration.seconds(5);

let packRenderer: CompletionWakeRendererDefinition | undefined;

/** Installs (or with `undefined` removes) the pack renderer; boot-only, in memory. */
export function setPackCompletionWakeRenderer(
  definition: CompletionWakeRendererDefinition | undefined,
): void {
  packRenderer = definition;
}

/** Collects the one renderer a runtime pack may register. */
export const loadPackCompletionWakeRenderer = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<CompletionWakeRendererDefinition | undefined> => {
  let renderer: CompletionWakeRendererDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineCompletionWakeRenderer: (definition) => {
        if (!pack.manifest.capabilities.includes(CAPABILITY)) {
          throw new Error(`Pack ${pack.manifest.id} defines a wake renderer without ${CAPABILITY}`);
        }
        if (renderer !== undefined) {
          throw new Error("Multiple workspace packs define a completion wake renderer");
        }
        if (typeof definition.render !== "function") {
          throw new Error(`Pack ${pack.manifest.id} wake renderer has no render function`);
        }
        renderer = definition as CompletionWakeRendererDefinition;
      },
    });
  }
  return renderer;
};

export const toCompletionWakeTasks = (
  subagents: ReadonlyArray<OrchestrationV2Subagent>,
  taskIds: ReadonlyArray<string>,
): ReadonlyArray<CompletionWakeTask> =>
  taskIds.flatMap((taskId) => {
    const subagent = subagents.find((candidate) => candidate.id === taskId);
    return subagent === undefined
      ? []
      : [
          {
            taskId,
            childThreadId: subagent.childThreadId,
            title: subagent.title,
            status: subagent.status,
            result: subagent.result,
          },
        ];
  });

const renderWithPack = (
  renderer: CompletionWakeRendererDefinition,
  input: DelegatedCompletionWakeInput,
  tasks: ReadonlyArray<CompletionWakeTask>,
) =>
  Effect.tryPromise(async () =>
    renderer.render({
      threadId: input.threadId,
      parentRunId: input.parentRunId,
      defaultText: input.defaultText,
      tasks,
    }),
  ).pipe(
    Effect.timeout(RENDER_TIMEOUT),
    Effect.flatMap((text) =>
      typeof text === "string" && text.trim().length > 0
        ? Effect.succeed(text)
        : Effect.fail(new PackWakeRenderEmptyError()),
    ),
  );

export const packCompletionWakeRendererLive = Layer.effect(
  DelegatedCompletionWakeRenderer,
  Effect.gen(function* () {
    const projections = yield* ProjectionStoreV2;
    return {
      render: (input: DelegatedCompletionWakeInput) => {
        const renderer = packRenderer;
        if (renderer === undefined) return Effect.succeed(input.defaultText);
        return projections.getThreadRecords(input.threadId, ["subagents"]).pipe(
          Effect.flatMap((records) =>
            renderWithPack(
              renderer,
              input,
              toCompletionWakeTasks(records.subagents, input.taskIds),
            ),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("t3team.pack-completion-wake-render-failed", {
              threadId: input.threadId,
              cause,
            }).pipe(Effect.as(input.defaultText)),
          ),
        );
      },
    };
  }),
);
