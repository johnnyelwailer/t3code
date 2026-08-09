/**
 * The host is the ONE place a workflow ask's attachments become text. The composition must append
 * the attachment blocks after the author's prompt, leave a turn without attachments byte-identical
 * to what the host dispatched before attachments existed (older journals carry no field), and
 * ignore anything in the field that isn't a named attachment.
 */

import { describe, expect, it } from "vite-plus/test";

import type { ThreadTurnPayload } from "./t3team-workflowEngineBrokerTypes.ts";
import { workflowTurnText } from "./t3team-workflowTurnText.ts";

const base: ThreadTurnPayload = { threadId: "t1", prompt: "Judge these gates" };

describe("workflowTurnText", () => {
  it("appends one fenced JSON block per attachment after the prompt", () => {
    const text = workflowTurnText({
      ...base,
      attachments: [
        { name: "gates", value: [{ id: "g1", ok: true }] },
        { name: "policy", value: { strict: true } },
      ],
    });
    expect(text.startsWith("Judge these gates\n\n## Attached data")).toBe(true);
    expect(text).toContain("### gates");
    expect(text).toContain('"id": "g1"');
    expect(text).toContain("### policy");
  });

  it("leaves a turn with no attachments exactly as the prompt", () => {
    expect(workflowTurnText(base)).toBe("Judge these gates");
    expect(workflowTurnText({ ...base, attachments: [] })).toBe("Judge these gates");
  });
});
