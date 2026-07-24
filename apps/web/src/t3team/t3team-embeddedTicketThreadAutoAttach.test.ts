import { describe, expect, it } from "vite-plus/test";

import {
  buildEmbeddedTicketThreadAutoAttachKey,
  takeEmbeddedTicketThreadAutoAttach,
} from "~/t3team/t3team-embeddedTicketThreadAutoAttach";
import {
  BACKEND,
  GITHUB_ACTIVITY,
  PROJECT,
  ROOT_TICKET,
  createTicket,
} from "~/t3team/t3team-ticketContextBundle.testHelpers";

describe("takeEmbeddedTicketThreadAutoAttach", () => {
  it("returns a thread-targeted request once per embedded thread and ticket pair", () => {
    const seenKeys = new Set<string>();

    const first = takeEmbeddedTicketThreadAutoAttach({
      seenKeys,
      threadId: "thread-1",
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET],
      githubActivityItems: GITHUB_ACTIVITY,
    });

    expect(first).toMatchObject({
      target: {
        type: "thread",
        threadId: "thread-1",
      },
      request: {
        projectId: PROJECT.id,
        targetLabel: `${ROOT_TICKET.ref.displayId} ${ROOT_TICKET.ref.title}`,
        dedupeKey: `${PROJECT.id}:${ROOT_TICKET.ref.displayId}:work-item`,
      },
    });
    expect(seenKeys).toEqual(
      new Set([
        buildEmbeddedTicketThreadAutoAttachKey({
          threadId: "thread-1",
          project: PROJECT,
          ticket: ROOT_TICKET,
        }),
      ]),
    );

    const second = takeEmbeddedTicketThreadAutoAttach({
      seenKeys,
      threadId: "thread-1",
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET],
      githubActivityItems: GITHUB_ACTIVITY,
    });

    expect(second).toBeNull();
  });

  it("treats a different thread or ticket as a new auto-attach target", () => {
    const seenKeys = new Set<string>();
    const siblingTicket = createTicket("PROJ-8", "Follow up the context handoff");

    const first = takeEmbeddedTicketThreadAutoAttach({
      seenKeys,
      threadId: "thread-1",
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET, siblingTicket],
      githubActivityItems: GITHUB_ACTIVITY,
    });
    const second = takeEmbeddedTicketThreadAutoAttach({
      seenKeys,
      threadId: "thread-1",
      backend: BACKEND,
      project: PROJECT,
      ticket: siblingTicket,
      projectTickets: [ROOT_TICKET, siblingTicket],
      githubActivityItems: GITHUB_ACTIVITY,
    });
    const third = takeEmbeddedTicketThreadAutoAttach({
      seenKeys,
      threadId: "thread-2",
      backend: BACKEND,
      project: PROJECT,
      ticket: ROOT_TICKET,
      projectTickets: [ROOT_TICKET, siblingTicket],
      githubActivityItems: GITHUB_ACTIVITY,
    });

    expect(first).not.toBeNull();
    expect(second).toMatchObject({
      target: {
        type: "thread",
        threadId: "thread-1",
      },
      request: {
        dedupeKey: `${PROJECT.id}:${siblingTicket.ref.displayId}:work-item`,
      },
    });
    expect(third).toMatchObject({
      target: {
        type: "thread",
        threadId: "thread-2",
      },
      request: {
        dedupeKey: `${PROJECT.id}:${ROOT_TICKET.ref.displayId}:work-item`,
      },
    });
  });
});
