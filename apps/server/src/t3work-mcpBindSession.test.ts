import { describe, expect, it } from "vite-plus/test";

import { resolveAllowedToolGroups } from "./t3work-mcpBindSession.ts";
import {
  createDefaultThreadToolContext,
  createThreadToolContext,
} from "./t3work-toolBrokerTestUtils.ts";

describe("resolveAllowedToolGroups", () => {
  it("defaults ticket threads to artifact.rw when kickoff groups are absent", () => {
    expect(
      resolveAllowedToolGroups(
        createThreadToolContext({
          tools: [{ id: "t3work.view.read", label: "Read view", capabilities: ["read"] }],
          view: { ticketId: "AC-91" },
        }),
      ),
    ).toEqual(["artifact.rw"]);
  });

  it("returns undefined when the thread has no ticket view and no kickoff groups", () => {
    expect(
      resolveAllowedToolGroups(
        createThreadToolContext({
          tools: [{ id: "t3work.view.read", label: "Read view", capabilities: ["read"] }],
        }),
      ),
    ).toBeUndefined();
  });

  it("prefers explicit kickoff allowedToolGroups over ticket defaults", () => {
    expect(
      resolveAllowedToolGroups(
        createDefaultThreadToolContext({
          allowedToolGroups: ["integration.read", "view.state"],
          view: { ticketId: "AC-91" },
        }),
      ),
    ).toEqual(["integration.read", "view.state"]);
  });

  it("ignores empty kickoff group arrays and falls back to ticket defaults", () => {
    expect(
      resolveAllowedToolGroups(
        createThreadToolContext({
          tools: [{ id: "t3work.view.read", label: "Read view", capabilities: ["read"] }],
          allowedToolGroups: [],
          view: { ticketId: "AC-91" },
        }),
      ),
    ).toEqual(["artifact.rw"]);
  });
});
