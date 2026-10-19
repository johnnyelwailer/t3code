/**
 * Live backing of {@link ColdLocalCompaction}: routes come from the pack registry, and a route
 * only applies while its local provider instance exists and is enabled. The summary is one
 * structured generation on that instance; it never touches the compacted thread's provider.
 *
 * @module t3team-coldLocalCompactionLive
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { getPackColdLocalCompactionRoute } from "../t3team-pack-coldLocalCompactionRoute.ts";
import { ColdLocalCompaction, ColdLocalCompactionError } from "./t3team-coldLocalCompaction.ts";

const CompactionSummary = Schema.Struct({ summary: Schema.String });

/** A stalled local model must not hold the compaction run; it falls back to the native path. */
const SUMMARY_TIMEOUT = Duration.minutes(3);

const compactionPrompt = (transcript: string): string =>
  [
    "You compact a coding-agent conversation so the agent can continue from your summary alone.",
    "Keep the user's goals, decisions with their reasons, constraints and preferences, the files and commands that matter, what is done, what is still open and the next step.",
    "Drop pleasantries and tool noise. Write plain prose and short bullet lists, at most 1500 words.",
    'Return a JSON object with the single key "summary".',
    "",
    "Conversation:",
    transcript,
  ].join("\n");

export const coldLocalCompactionLive = Layer.effect(
  ColdLocalCompaction,
  Effect.gen(function* () {
    const registry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    const textGeneration = yield* TextGeneration;
    return {
      routeFor: (driver) =>
        Effect.gen(function* () {
          const route = getPackColdLocalCompactionRoute(driver);
          if (route === undefined || !route.enabled) return undefined;
          const local = yield* registry.getInstance(
            ProviderInstanceId.make(route.localProviderInstance),
          );
          return local?.enabled === true && textGeneration.generateStructured !== undefined
            ? route
            : undefined;
        }),
      summarize: ({ route, transcript }) => {
        const generateStructured = textGeneration.generateStructured;
        if (generateStructured === undefined) {
          return Effect.fail(
            new ColdLocalCompactionError({ reason: "Structured text generation is unavailable." }),
          );
        }
        return generateStructured({
          cwd: process.cwd(),
          prompt: compactionPrompt(transcript),
          outputSchema: CompactionSummary,
          modelSelection: {
            instanceId: ProviderInstanceId.make(route.localProviderInstance),
            model: route.localModel,
          },
        }).pipe(
          Effect.map(({ summary }) => summary),
          Effect.timeout(SUMMARY_TIMEOUT),
          Effect.mapError(
            (cause) =>
              new ColdLocalCompactionError({
                reason: "The local model could not summarize.",
                cause,
              }),
          ),
        );
      },
    };
  }),
);
