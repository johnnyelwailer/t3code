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
  it("decodes a conforming JSON reply to the structured value on the first attempt", async () => {
    const broker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn"
        ? { kind: "resolve", reply: JSON.stringify({ summary: "Ship behind a flag" }) }
        : { kind: "defer" },
    );
    const ask = createAskVerb({
      dispatch: dispatchFor(new Map()),
      broker,
      defaultModel: undefined,
    });
    const schema = Schema.Struct({ summary: Schema.String }) as Schema.Schema<unknown>;

    await expect(ask("thread.turn", "thread-1", "Summarize", { schema })).resolves.toEqual({
      summary: "Ship behind a flag",
    });
    // No re-ask: the fired prompt already carries the schema-derived shape the model replies to.
    expect(broker.sent).toHaveLength(1);
    const first = broker.sent[0];
    if (first === undefined) throw new Error("expected one fired turn");
    const prompt = ((first.payload ?? {}) as { prompt?: string }).prompt ?? "";
    expect(prompt).toContain("single JSON value matching the required schema");
    expect(prompt).toContain('"summary"');
  });

  it("strips a code fence before decoding, so a fenced JSON reply still decodes", async () => {
    const broker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn"
        ? {
            kind: "resolve",
            reply: "```json\n" + JSON.stringify({ summary: "Fenced" }) + "\n```",
          }
        : { kind: "defer" },
    );
    const ask = createAskVerb({
      dispatch: dispatchFor(new Map()),
      broker,
      defaultModel: undefined,
    });
    const schema = Schema.Struct({ summary: Schema.String }) as Schema.Schema<unknown>;

    await expect(ask("thread.turn", "thread-1", "Summarize", { schema })).resolves.toEqual({
      summary: "Fenced",
    });
    expect(broker.sent).toHaveLength(1);
  });

  it("never extracts JSON out of a pended reply: the whole reply must parse, else re-ask, then fail loud", async () => {
    // The owner-reported regression shape: a preamble BEFORE the JSON. The contract is whole-reply
    // parsing, so the preamble makes it unparseable — nothing is spliced out, the step re-asks,
    // and only exhaustion fails it. A partial extraction could pluck the wrong object out of prose.
    const pended =
      "Im going to prepare the draft text now.\n" + JSON.stringify({ summary: "Ship it" });
    const broker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn" ? { kind: "resolve", reply: pended } : { kind: "defer" },
    );
    const ask = createAskVerb({
      dispatch: dispatchFor(new Map()),
      broker,
      defaultModel: undefined,
    });
    const schema = Schema.Struct({ summary: Schema.String }) as Schema.Schema<unknown>;

    let failure: unknown;
    try {
      await ask("thread.turn", "thread-1", "Summarize", { schema });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(SchemaExhaustedError);
    expect(String((failure as Error).message)).toContain(
      "did not satisfy the response schema after 3 attempts",
    );
    // The decode error carries the offending payload — a silent string passthrough never happens.
    expect(String((failure as Error).message)).toContain("Im going to prepare the draft text now");
    expect(broker.sent).toHaveLength(3); // one attempt + two corrective re-asks
    const prompts = broker.sent.map((envelope) => (envelope.payload as { prompt?: string }).prompt);
    expect(prompts[0]).not.toContain("previous reply did not match");
    expect(prompts[1]).toContain("previous reply did not match the required schema");
  });

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
