import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildChildKickoffText,
  resolveStartChildHandoffPlacement,
} from "./t3team-toolBrokerStartChildHandoff.ts";

describe("buildChildKickoffText", () => {
  const parent = { id: ThreadId.make("parent-1"), title: "Main Work" };

  it("frames the child with the parent identity and the report-once contract", () => {
    const text = buildChildKickoffText(parent, "do the thing");
    expect(text).toContain("Delegated by parent thread «Main Work»");
    expect(text).toContain("parent-1");
    expect(text.endsWith("\n\ndo the thing")).toBe(true);
  });

  it("tells the child to stay silent and report exactly once when done", () => {
    const text = buildChildKickoffText(parent, "do the thing");
    expect(text).toContain("Stay silent while you work");
    expect(text).toContain("exactly once, when you are completely done");
    expect(text).toContain("No progress pings, no acknowledgements");
    // The old "report progress" phrasing is gone — it invited check-in pings.
    expect(text).not.toContain("Report progress");
  });
});

describe("resolveStartChildHandoffPlacement", () => {
  const threadId = ThreadId.make("caller-1");

  it("parents the child under the calling thread by default", () => {
    const placement = resolveStartChildHandoffPlacement({
      currentDisplayMode: "thread",
      currentTicketId: undefined,
      requestedTicketId: undefined,
      threadId,
    });
    expect(placement.parentThreadId).toBe("caller-1");
    expect(placement.ticketId).toBeUndefined();
  });

  it("re-parents under the workflow's launching thread when the caller is a workflow child", () => {
    // A workflow-spawned child thread is ephemeral (hidden from the sidebar): parenting a
    // start_child session to it renders the session flat. The visible launching thread is
    // the correct navigation parent.
    const placement = resolveStartChildHandoffPlacement({
      currentDisplayMode: "thread",
      currentTicketId: "TICKET-7",
      requestedTicketId: undefined,
      threadId,
      workflowLaunchThreadId: "launch-1",
    });
    expect(placement.parentThreadId).toBe("launch-1");
    expect(placement.ticketId).toBe("TICKET-7");
  });

  it("keeps the calling thread as parent when no workflow launch thread resolves", () => {
    const placement = resolveStartChildHandoffPlacement({
      currentDisplayMode: "embedded",
      currentTicketId: undefined,
      requestedTicketId: "TICKET-9",
      threadId,
      workflowLaunchThreadId: undefined,
    });
    expect(placement.parentThreadId).toBe("caller-1");
    expect(placement.ticketId).toBe("TICKET-9");
  });
});
