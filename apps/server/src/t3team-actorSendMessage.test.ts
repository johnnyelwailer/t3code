/**
 * Inter-agent delivery summary (GHE #154): the optional sender-provided
 * `summary` rides the `thread.actor.message` command so the recipient's
 * reaction input can show a short summary instead of a raw head-of-body cut.
 * A sender-supplied summary is capped at the summary budget BEFORE it is
 * persisted, so a long one never ships verbatim.
 */
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeActorSendMessage } from "./t3team-actorSendMessage.ts";
import { T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS } from "./t3team-actorReactionInput.ts";

const thread = (id: string) =>
  ({
    id: ThreadId.make(id),
    projectId: "project",
    title: `Thread ${id}`,
    messages: [],
  }) as never;

const make = (dispatches: unknown[]) => {
  const query = {
    getThreadDetailById: (id: ThreadId) => Effect.succeed(Option.some(thread(String(id)))),
  } as unknown as ProjectionSnapshotQueryShape;
  const orchestration = {
    dispatch: (command: unknown) => {
      dispatches.push(command);
      return Effect.void;
    },
  } as unknown as OrchestrationEngineShape;
  return makeActorSendMessage({ query, orchestration });
};

describe("makeActorSendMessage summary", () => {
  it.effect("rides the sender-provided summary onto the command, trimmed", () =>
    Effect.gen(function* () {
      const dispatches: unknown[] = [];
      const send = make(dispatches);
      yield* send({
        toThreadId: "target",
        fromThreadId: "sender",
        text: "body",
        summary: "  Branch pushed; tests green.  ",
      });
      const command = dispatches[0] as { summary?: string; text: string };
      expect(command.summary).toBe("Branch pushed; tests green.");
      expect(command.text).toBe("body");
    }),
  );

  it.effect("caps a long sender summary at the summary budget on a word boundary", () =>
    Effect.gen(function* () {
      const dispatches: unknown[] = [];
      const send = make(dispatches);
      const longSummary = "word ".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS) + "tail";
      yield* send({
        toThreadId: "target",
        fromThreadId: "sender",
        text: "body",
        summary: longSummary,
      });
      const command = dispatches[0] as { summary?: string };
      expect(command.summary).toBeDefined();
      expect((command.summary ?? "").length).toBeLessThanOrEqual(
        T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS + 1, // ellipsis
      );
      expect(command.summary?.endsWith("…")).toBe(true);
    }),
  );

  it.effect("omits the summary key when none is given or it is whitespace", () =>
    Effect.gen(function* () {
      for (const summary of [undefined, "", "   "]) {
        const dispatches: unknown[] = [];
        const send = make(dispatches);
        yield* send({
          toThreadId: "target",
          fromThreadId: "sender",
          text: "body",
          ...(summary !== undefined ? { summary } : {}),
        });
        const command = dispatches[0] as Record<string, unknown>;
        expect("summary" in command).toBe(false);
      }
    }),
  );
});
