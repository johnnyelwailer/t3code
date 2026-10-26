/**
 * Appends the child instances' compact provider-usage lines to the delegated-completion wake, so
 * an orchestrating agent sees the quota windows its children draw from without a tool round trip.
 *
 * It wraps whichever `DelegatedCompletionWakeRenderer` it is layered over (the pack renderer, or
 * the default text), so it composes instead of replacing. Only-if-available: with no usage data
 * for any task's instance — or on any read failure — the inner text is returned untouched.
 *
 * @module t3team-providerUsageWakeRenderer
 */
import { compactProviderUsageLine, providerUsageLabel } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { delegatedCompletionWakeDetail } from "./orchestration-v2/Orchestrator.ts";
import { ProjectionStoreV2 } from "./orchestration-v2/ProjectionStore.ts";
import * as ProviderRegistry from "./provider/ProviderRegistry.ts";
import {
  DelegatedCompletionWakeRenderer,
  type DelegatedCompletionWakeInput,
} from "./t3team-v2/t3team-delegatedCompletionWakeRenderer.ts";

export const providerUsageWakeRendererLive = Layer.effect(
  DelegatedCompletionWakeRenderer,
  Effect.gen(function* () {
    const inner = yield* DelegatedCompletionWakeRenderer;
    const projections = yield* ProjectionStoreV2;
    const registry = yield* ProviderRegistry.ProviderRegistry;

    // Subagents are read with the usage so the default text can be built from the same tasks.
    const readUsage = Effect.fn("ProviderUsageWakeRenderer.readUsage")(function* (
      input: DelegatedCompletionWakeInput,
    ) {
      const { subagents } = yield* projections.getThreadRecords(input.threadId, ["subagents"]);
      const instanceIds = new Set(
        subagents
          .filter((task) => input.taskIds.includes(task.id))
          .map((task) => task.providerInstanceId),
      );
      const providers = yield* registry.getProviders;
      const lines = providers
        .filter((provider) => instanceIds.has(provider.instanceId))
        .flatMap((provider) => {
          const line = compactProviderUsageLine(providerUsageLabel(provider), provider.usageLimits);
          return line === null ? [] : [line];
        });
      return { subagents, lines };
    });

    return {
      render: Effect.fn("ProviderUsageWakeRenderer.render")(function* (
        input: DelegatedCompletionWakeInput,
      ) {
        const text = yield* inner.render(input);
        const usage = yield* readUsage(input).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("t3team.provider-usage-wake.read-failed", {
              threadId: input.threadId,
              cause,
            }).pipe(Effect.as(undefined)),
          ),
        );
        if (usage === undefined) return text;
        const present = new Set(text.split("\n"));
        const lines = usage.lines.filter((line) => !present.has(line));
        if (lines.length === 0) return text;
        // The placeholder only names the tasks. Once usage is appended the text differs from it,
        // so it is delivered as a rendered wake and the orchestrator no longer swaps in its own
        // default (title, status, inlined result): build that default here, then decorate it.
        const base =
          text === input.defaultText
            ? delegatedCompletionWakeDetail(input.taskIds, usage.subagents)
            : text;
        return `${base}\n\n${lines.join("\n")}`;
      }),
    };
  }),
);
