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

import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";
import { buildWorkflowShapePreviewMessage } from "./t3team-workflowShapePreview.ts";

export const emitWorkflowShapePreview = (input: {
  readonly fileSystem: FileSystem.FileSystem | undefined;
  readonly launchThreadId: string | undefined;
  readonly workflowPath: string;
  readonly runId: string;
  readonly host: Pick<WorkflowHostPort, "postMessage">;
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
    const message = buildWorkflowShapePreviewMessage({
      threadId: launchThreadId,
      workflowPath: input.workflowPath,
      sourceText: shapeSource,
      runId: input.runId,
    });
    // Best-effort: a plan card that cannot post never affects the launch.
    yield* Effect.promise(() => input.host.postMessage(message).catch(() => undefined));
  });
