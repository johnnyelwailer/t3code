import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveStartChildHandoffPlacement } from "./t3work-toolBrokerStartChildHandoff.ts";

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
