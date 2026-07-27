import { describe, expect, it } from "@effect/vitest";
import type { OrchestrationCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { makeDraft } from "./t3team-toolBrokerDraftMutationMake.ts";

type MessageUpsert = Extract<OrchestrationCommand, { type: "thread.message.upsert" }>;

const draftResult = () =>
  makeDraft({
    tool: "t3team.work_item.assignee.draft_update",
    issueIdOrKey: "PROJ-42",
    field: "assignee",
    patch: { assigneeAccountId: "abc-123" },
    summary: "Drafted assigning PROJ-42.",
  });

function recordingPublisher() {
  const commands: OrchestrationCommand[] = [];
  const publish = makeT3TeamDraftMutationPublisher({
    threadId: "thread-1",
    dispatch: (command) => {
      commands.push(command);
      return Effect.succeed({ sequence: 1 });
    },
  });
  return { commands, publish };
}

describe("makeT3TeamDraftMutationPublisher", () => {
  it.effect("publishes the draft as a hidden attachment on the proposing thread", () =>
    Effect.gen(function* () {
      const { commands, publish } = recordingPublisher();

      const result = yield* publish(draftResult());

      expect(result.isError).toBeUndefined();
      expect(commands).toHaveLength(1);
      const command = commands[0] as MessageUpsert;
      expect(command.type).toBe("thread.message.upsert");
      expect(command.message.role).toBe("system");
      // Transport, not conversation: invisible to the reader, absent from the agent's prompt.
      expect(command.message.t3teamExt?.visibleToUser).toBe(false);
      expect(command.message.t3teamExt?.visibleToAgent).toBe(false);

      expect(command.message.t3teamExt?.attachments?.[0]).toMatchObject({
        kind: "draft-mutation",
        draft: {
          id: `jira-draft:${command.message.messageId}`,
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
        dispatch: () => Effect.fail("thread is gone"),
      });

      const result = yield* publish(draftResult());

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("nothing is pending");
    }),
  );

  it.effect("passes non-draft and error results through untouched", () =>
    Effect.gen(function* () {
      const { commands, publish } = recordingPublisher();

      const plain = yield* publish(okResult({ ok: true }));
      const failed = yield* publish(errorResult("nope"));

      expect(plain.structuredContent).toEqual({ ok: true });
      expect(failed.isError).toBe(true);
      expect(commands).toHaveLength(0);
    }),
  );
});
