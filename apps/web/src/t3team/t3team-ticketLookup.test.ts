import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectTicketLookup,
  matchesProjectThreadTicket,
  resolveCanonicalProjectTicketId,
} from "~/t3team/t3team-ticketLookup";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "IES-18425 kickoff 1",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

function createTicket(overrides: Partial<ProjectTicket> = {}): ProjectTicket {
  return {
    id: overrides.id ?? "ticket-18425-internal",
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: overrides.ref?.provider ?? "atlassian",
      kind: overrides.ref?.kind ?? "jira-issue",
      id: overrides.ref?.id ?? overrides.id ?? "ticket-18425-internal",
      displayId: overrides.ref?.displayId ?? "IES-18425",
      title: overrides.ref?.title ?? "Review feat/ies-18419 form update",
      url: overrides.ref?.url ?? "",
      projectId: overrides.ref?.projectId ?? "project-1",
    },
    status: overrides.status ?? "Open",
    updatedAt: overrides.updatedAt ?? "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("resolveCanonicalProjectTicketId", () => {
  it("normalizes a display-id route to the canonical stored ticket id", () => {
    const lookup = buildProjectTicketLookup([createTicket()]);

    expect(resolveCanonicalProjectTicketId("IES-18425", lookup)).toBe("ticket-18425-internal");
  });
});

describe("matchesProjectThreadTicket", () => {
  it("matches a display-id-backed thread against the canonical ticket input", () => {
    expect(
      matchesProjectThreadTicket(
        createThread({ ticketId: "IES-18425", ticketDisplayId: "IES-18425" }),
        "ticket-18425-internal",
        "IES-18425",
      ),
    ).toBe(true);
  });

  it("does not match unrelated tickets", () => {
    expect(
      matchesProjectThreadTicket(
        createThread({ ticketId: "IES-18425", ticketDisplayId: "IES-18425" }),
        "ticket-99999-internal",
        "IES-99999",
      ),
    ).toBe(false);
  });
});
