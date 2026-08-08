/**
 * Text generation for pack-backed provider drivers.
 *
 * Split out of `t3team-pack-driverBridge.ts`, which had grown past the fork LOC ceiling: this is
 * a self-contained slice — either the pack definition supplies text generation and we adapt it,
 * or every operation fails with a clear `does not support text generation` error. Its behaviour
 * is already covered by `t3team-pack-textGenerationBridge.test.ts`.
 */
import { ProviderDriverKind, TextGenerationError } from "@t3tools/contracts";
import type { PackProviderDriverDefinition } from "@t3team/packs";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { TextGeneration } from "./textGeneration/TextGeneration.ts";

// Inlined rather than shared with the driver bridge: importing it back would make these two
// modules cyclic, and the sibling pack modules already spell this out locally.
const errorDetail = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const unsupportedTextGeneration = (
  driver: ProviderDriverKind,
): TextGeneration["Service"] => {
  const fail = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: `Provider driver '${driver}' does not support text generation.`,
      }),
    );
  return {
    generateCommitMessage: () => fail("generateCommitMessage"),
    generatePrContent: () => fail("generatePrContent"),
    generateBranchName: () => fail("generateBranchName"),
    generateThreadTitle: () => fail("generateThreadTitle"),
  };
};

export const bridgePackTextGeneration = (
  packInstance: Awaited<ReturnType<PackProviderDriverDefinition["create"]>>,
  driver: ProviderDriverKind,
): TextGeneration["Service"] => {
  const service = packInstance.textGeneration;
  if (!service) return unsupportedTextGeneration(driver);

  const attempt = <A>(operation: string, run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new TextGenerationError({
          operation,
          detail: `Provider driver '${driver}' text generation failed: ${errorDetail(cause)}`,
          cause,
        }),
    });

  return {
    generateCommitMessage: (input) =>
      attempt("generateCommitMessage", () => service.generateCommitMessage(input)),
    generatePrContent: (input) =>
      attempt("generatePrContent", () => service.generatePrContent(input)),
    generateBranchName: (input) =>
      attempt("generateBranchName", () => service.generateBranchName(input)),
    generateThreadTitle: (input) =>
      attempt("generateThreadTitle", () => service.generateThreadTitle(input)),
    ...(service.generateStructured
      ? {
          generateStructured: (input) =>
            attempt("generateStructured", () =>
              service.generateStructured!({
                cwd: input.cwd,
                prompt: input.prompt,
                modelSelection: input.modelSelection,
              }),
            ).pipe(
              Effect.flatMap((value) =>
                Schema.decodeEffect(input.outputSchema)(value).pipe(
                  Effect.mapError(
                    (cause) =>
                      new TextGenerationError({
                        operation: "generateStructured",
                        detail: `Provider driver '${driver}' returned invalid structured output.`,
                        cause,
                      }),
                  ),
                ),
              ),
            ) as never,
        }
      : {}),
  };
};
