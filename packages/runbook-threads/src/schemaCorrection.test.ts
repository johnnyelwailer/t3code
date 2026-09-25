import * as Schema from "effect/Schema";
import * as fc from "effect/testing/FastCheck";
import { describe, expect, it } from "vite-plus/test";

import {
  correctivePrompt,
  exhaustedReason,
  legacyCorrectivePrompt,
  offendingReply,
} from "./schemaCorrection.ts";

const Deploy = Schema.Struct({ deployed: Schema.Boolean, message: Schema.String });
const PROSE = "I'm waiting for the deploy-check job to complete. It will notify me automatically.";

describe("correctivePrompt", () => {
  it("quotes the agent's own reply back with a JSON-only instruction and the step-ends rule", () => {
    const prompt = correctivePrompt({
      kind: "thread.turn",
      basePrompt: "Check the deploy",
      detail: "Invalid thread reply: Expected object",
      reply: PROSE,
      instruction: 'Required shape:\n{\n  "deployed": boolean,\n}',
    });
    expect(prompt.startsWith("Check the deploy\n\n")).toBe(true);
    expect(prompt).toContain("previous reply did not match the required schema");
    expect(prompt).toContain("Expected object");
    expect(prompt).toContain(`<<<\n${PROSE}\n>>>`);
    expect(prompt).toContain("no prose, no preamble");
    expect(prompt).toContain("the step ends when your turn ends");
    expect(prompt).toContain('"deployed": boolean');
  });

  it("keeps a user.input correction byte-identical to its pre-change wording", () => {
    // A human reads this beside an affordance; its journaled argsHash must not drift.
    expect(
      correctivePrompt({
        kind: "user.input",
        basePrompt: "Approve?",
        detail: "Expected boolean",
        reply: "maybe",
        instruction: "Reply with true or false.",
      }),
    ).toBe(
      "Approve?\n\nYour previous reply did not match the required schema (Expected boolean). Reply with true or false.",
    );
  });

  it("bounds a huge reply and quotes a non-string reply as JSON", () => {
    const huge = correctivePrompt({
      kind: "thread.turn",
      basePrompt: "p",
      detail: "d",
      reply: "x".repeat(10_000),
      instruction: "i",
    });
    expect(huge.length).toBeLessThan(2_500);
    const structured = correctivePrompt({
      kind: "thread.turn",
      basePrompt: "p",
      detail: "d",
      reply: { deployed: "yes" },
      instruction: "i",
    });
    expect(structured).toContain('{"deployed":"yes"}');
  });

  it("offers the exact pre-rewording agent correction as the legacy encoding", () => {
    // Journals recorded before the rewording hashed this exact string.
    expect(
      legacyCorrectivePrompt({ basePrompt: "Check", detail: "Expected object", instruction: "I" }),
    ).toBe("Check\n\nYour previous reply did not match the required schema (Expected object). I");
  });

  it("never throws on an unserializable reply and never splits a surrogate pair", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const reply of [10n, circular, undefined]) {
      expect(() =>
        correctivePrompt({
          kind: "thread.turn",
          basePrompt: "p",
          detail: "d",
          reply,
          instruction: "i",
        }),
      ).not.toThrow();
    }
    const line = offendingReply(`${"a".repeat(158)}😀tail`);
    expect(line.endsWith("…")).toBe(true);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(line)).toBe(false);
  });

  it("is a pure function of its inputs (replay re-derives the same payload)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.anything(), (basePrompt, detail, reply) => {
        const input = { kind: "thread.turn" as const, basePrompt, detail, reply, instruction: "i" };
        const prompt = correctivePrompt(input);
        expect(correctivePrompt(input)).toBe(prompt);
        expect(prompt.startsWith(basePrompt)).toBe(true);
        expect(prompt).toContain("no prose, no preamble");
        // The quoted reply is bounded no matter what arrived.
        expect(prompt.length).toBeLessThan(basePrompt.length + detail.length + 2_000);
      }),
    );
  });
});

describe("exhaustedReason / offendingReply", () => {
  it("names the ask, the schema shape, the decode detail and the offending reply", () => {
    const reason = exhaustedReason({
      kind: "thread.turn",
      threadId: "run:64",
      attempts: 3,
      schema: Deploy as Schema.Schema<unknown>,
      detail: "Invalid thread reply: Expected object",
      reply: PROSE,
    });
    expect(reason).toContain(
      "thread.turn on thread 'run:64' did not satisfy the response schema after 3 attempts",
    );
    expect(reason).toContain("expected: ");
    expect(reason).toContain("deployed");
    expect(reason).toContain("last reply: I'm waiting for the deploy-check");
  });

  it("always yields a bounded single line", () => {
    fc.assert(
      fc.property(fc.anything(), (reply) => {
        const line = offendingReply(reply);
        expect(line.length).toBeLessThanOrEqual(160);
        expect(line).not.toMatch(/\n/);
      }),
    );
  });
});
