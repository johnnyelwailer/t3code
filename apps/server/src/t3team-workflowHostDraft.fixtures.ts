/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- The launch API is promise-shaped; the fixture bridges the broker layer once. */
/**
 * The real tool broker (`T3TeamToolBrokerLive` over the V2 test fakes) for workflow tests whose
 * body proposes a work-item draft: the launch thread's tool context is seeded the way the web
 * composer seeds it before a turn, and every thread artifact the broker writes is recorded —
 * a proposed draft lands as a `draft-mutation` artifact on the proposing thread
 * (`t3team-draftMutationPublish.ts`), never as a message.
 */
import type { T3TeamMessageDraftMutationAttachment } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND } from "./t3team-draftMutationStatus.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import type { T3TeamThreadArtifactInput } from "./t3team-v2/t3team-threadArtifactsStore.ts";

export const WORKFLOW_DRAFT_TOOL = "t3team.work_item.description.draft_update";

/** The tool context a thread offers the draft tool with. */
export const draftToolContext = () =>
  createThreadToolContext({
    tools: [{ id: WORKFLOW_DRAFT_TOOL, label: "Draft description", capabilities: ["write"] }],
  });

/** A broker with `thread-1` seeded, plus every artifact it records. */
export async function makeRecordingDraftBroker(): Promise<{
  readonly broker: T3TeamToolBrokerShape;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifactInput>;
}> {
  const artifacts: T3TeamThreadArtifactInput[] = [];
  const broker = await Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* T3TeamToolBroker;
      yield* resolved.bindSession({ threadId, toolContext: draftToolContext() });
      return resolved;
    }).pipe(
      Effect.provide(
        makeBrokerLayer(undefined, { onArtifact: (artifact) => artifacts.push(artifact) }),
      ),
    ),
  );
  return { broker, artifacts };
}

/** The first proposed draft among `artifacts`, with the thread it was proposed on. */
export function findDraftArtifact(artifacts: ReadonlyArray<T3TeamThreadArtifactInput>) {
  const artifact = artifacts.find((entry) => entry.kind === T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND);
  if (artifact === undefined) return undefined;
  return {
    threadId: artifact.threadId,
    messageId: artifact.messageId,
    attachment: artifact.payload as T3TeamMessageDraftMutationAttachment,
  };
}
