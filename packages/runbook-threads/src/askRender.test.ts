import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { planAskRender } from "./askRender.ts";

describe("host-neutral ask rendering", () => {
  it("keeps a choice literal from being JSON-coerced", () => {
    const plan = planAskRender({
      kind: "user.input",
      schema: Schema.Literals(["true", "hold"]),
      attachments: undefined,
      labels: undefined,
    });

    expect(plan.affordance).toEqual({ kind: "choice", options: ["true", "hold"] });
    expect(plan.coerceReply("true")).toBe("true");
    expect(plan.promptSuffix).toBe("");
  });

  it("renders boolean labels without adding an agent schema prompt", () => {
    const plan = planAskRender({
      kind: "user.input",
      schema: Schema.Boolean,
      attachments: undefined,
      labels: { true: "Ship", false: "Hold" },
    });

    expect(plan.affordance).toEqual({
      kind: "boolean",
      labels: { true: "Ship", false: "Hold" },
    });
    expect(plan.correctiveInstruction).toBe("Reply with true or false.");
    expect(plan.coerceReply("true")).toBe(true);
    expect(plan.promptSuffix).toBe("");
  });
});
