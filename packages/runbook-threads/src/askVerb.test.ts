import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { SchemaExhaustedError } from "@runbook/core/errors";
import type { HandleDispatch, ReplyResolver } from "@runbook/core/handles";
import { createMockBroker } from "./broker.ts";
import { createAskVerb } from "./askVerb.ts";

function dispatchFor(replies: Map<string, unknown>): HandleDispatch {
  let nextId = 0;
  return {
    send: async (call) => {
      const id = `run-1:${++nextId}`;
      const resolver: ReplyResolver = {
        resolve: (reply) => replies.set(id, reply),
        reject: () => replies.delete(id),
      };
      await call.fire(id, resolver);
      return id;
    },
    sendOneWay: () => "unused",
    awaitResolution: async <R>(id: string) => replies.get(id) as R,
  };
}

describe("host-neutral ask dispatch", () => {
  it("retries schema-invalid replies exactly twice before exhausting", async () => {
    const broker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn" ? { kind: "resolve", reply: "{}" } : { kind: "defer" },
    );
    const ask = createAskVerb({
      dispatch: dispatchFor(new Map()),
      broker,
      defaultModel: undefined,
    });
    const schema = Schema.Struct({ summary: Schema.String }) as Schema.Schema<unknown>;

    await expect(ask("thread.turn", "thread-1", "Summarize", { schema })).rejects.toBeInstanceOf(
      SchemaExhaustedError,
    );
    expect(broker.sent).toHaveLength(3);
    const retry = broker.sent[1];
    if (retry === undefined) throw new Error("expected a corrective retry");
    expect((retry.payload as { prompt?: string }).prompt).toContain("previous reply did not match");
  });
});
