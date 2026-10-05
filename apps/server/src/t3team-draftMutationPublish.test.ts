import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { makeDraft } from "./t3team-toolBrokerDraftMutationMake.ts";
import {
  T3TeamThreadArtifactsStoreError,
  type T3TeamThreadArtifactInput,
} from "./t3team-v2/t3team-threadArtifactsStore.ts";

const stored = (artifact: T3TeamThreadArtifactInput) => ({
  ...artifact,
  messageId: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
});

const draftResult = () =>
  makeDraft({
    tool: "t3team.work_item.assignee.draft_update",
    issueIdOrKey: "PROJ-42",
    field: "assignee",
    patch: { assigneeAccountId: "abc-123" },
    summary: "Drafted assigning PROJ-42.",
  });

function recordingPublisher() {
  const artifacts: T3TeamThreadArtifactInput[] = [];
  const publish = makeT3TeamDraftMutationPublisher({
    threadId: "thread-1",
    recordArtifact: (artifact) =>
      Effect.sync(() => {
        artifacts.push(artifact);
        return stored(artifact);
      }),
  });
  return { artifacts, publish };
}

describe("makeT3TeamDraftMutationPublisher", () => {
  it.effect("publishes the draft as a draft-mutation artifact on the proposing thread", () =>
    Effect.gen(function* () {
      const { artifacts, publish } = recordingPublisher();

      const result = yield* publish(draftResult());

      expect(result.isError).toBeUndefined();
      expect(artifacts).toHaveLength(1);
      const artifact = artifacts[0]!;
      expect(artifact.threadId).toBe("thread-1");
      expect(artifact.kind).toBe("draft-mutation");
      expect(artifact.messageId).toBeNull();
      // The draft id IS the artifact id, so the verdict route addresses the same row.
      expect(artifact.id.startsWith("jira-draft:")).toBe(true);
      expect(artifact.payload).toMatchObject({
        kind: "draft-mutation",
        draft: {
          id: artifact.id,
          kind: "jira-work-item-draft",
          tool: "t3team.work_item.assignee.draft_update",
          target: { provider: "jira", issueIdOrKey: "PROJ-42" },
          field: "assignee",
          patch: { assigneeAccountId: "abc-123" },
          status: "draft",
          summary: "Drafted assigning PROJ-42.",
        },
      });
    }),
  );

  it.effect("tells the agent nothing is pending when the draft cannot be published", () =>
    Effect.gen(function* () {
      const publish = makeT3TeamDraftMutationPublisher({
        threadId: "thread-1",
        recordArtifact: () =>
          Effect.fail(
            new T3TeamThreadArtifactsStoreError({ operation: "upsert", cause: "thread is gone" }),
          ),
      });

      const result = yield* publish(draftResult());

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("nothing is pending");
    }),
  );

  it.effect("passes non-draft and error results through untouched", () =>
    Effect.gen(function* () {
      const { artifacts, publish } = recordingPublisher();

      const plain = yield* publish(okResult({ ok: true }));
      const failed = yield* publish(errorResult("nope"));

      expect(plain.structuredContent).toEqual({ ok: true });
      expect(failed.isError).toBe(true);
      expect(artifacts).toHaveLength(0);
    }),
  );
});
