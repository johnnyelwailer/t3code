/**
 * The best-effort "plan" card shown while an ephemeral workflow spins up.
 *
 * Its own module because it is strictly optional and must stay that way: an unreadable source, an
 * underivable shape, or a headless launch all skip it, and none of those may affect the launch. It
 * is also the one part of `launchPreparedWorkflow` that touches the filesystem, so isolating it
 * keeps that dependency out of the launch path's own signature.
 */
import type * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";

import type { OrchestrationCommand } from "@t3tools/contracts";

import { buildWorkflowShapePreviewCommand } from "./t3team-workflowShapePreview.ts";

export const emitWorkflowShapePreview = (input: {
  readonly fileSystem: FileSystem.FileSystem | undefined;
  readonly launchThreadId: string | undefined;
  readonly workflowPath: string;
  readonly runId: string;
  readonly nowIso: () => string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
}) =>
  Effect.gen(function* () {
    const { fileSystem, launchThreadId } = input;
    if (fileSystem === undefined || launchThreadId === undefined) {
      return;
    }
    const shapeSource = yield* fileSystem
      .readFileString(input.workflowPath)
      .pipe(Effect.orElseSucceed(() => null));
    if (shapeSource === null) {
      return;
    }
    const shapeCommand = buildWorkflowShapePreviewCommand({
      threadId: launchThreadId,
      workflowPath: input.workflowPath,
      sourceText: shapeSource,
      runId: input.runId,
      nowIso: input.nowIso(),
    });
    if (shapeCommand) {
      yield* Effect.promise(() => input.dispatch(shapeCommand));
    }
  });
