/**
 * One resource, many attach paths, one attachment — asserted on the STORE, because the store is what
 * becomes the turn's context payload. A render-side filter would have left both entries here and the
 * model would still have received the work item twice.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { appendContextAttachmentsToPrompt } from "~/t3team/chat/t3team-prepareThreadContextAttachments";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { buildT3TeamWorkItemDedupeKey } from "~/t3team/t3team-contextAttachmentDedupeKey";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

const THREAD_ID = "thread-1";
const DEDUPE_KEY = buildT3TeamWorkItemDedupeKey({
  provider: "atlassian",
  projectId: "project-1",
  workItemKey: "NXAI-8",
});

/** The same Jira issue, attached by two different paths — different ids, different labels, one resource. */
function workItemAttachment(overrides?: Partial<T3TeamContextAttachment>): T3TeamContextAttachment {
  return {
    id: `attachment-${Math.random().toString(36).slice(2)}`,
    kind: "jira-work-item",
    label: "NXAI-8 Dev-Rolle",
    dedupeKey: DEDUPE_KEY,
    contextText: "NXAI-8 context bundle",
    ...overrides,
  };
}

function threadAttachments() {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[THREAD_ID] ?? [];
}

describe("work item dedupe key", () => {
  beforeEach(() => {
    useT3TeamAddToChatStore.setState({
      pendingByProjectId: {},
      pendingByKickoffKey: {},
      threadAttachmentsByThreadId: {},
    });
  });

  it("is identity-based, so a renamed work item still collides with itself", () => {
    expect(DEDUPE_KEY).toBe("atlassian:work-item:project-1:NXAI-8");
    // Same resource, different title — same key.
    expect(
      buildT3TeamWorkItemDedupeKey({
        provider: "atlassian",
        projectId: "project-1",
        workItemKey: "NXAI-8",
      }),
    ).toBe(DEDUPE_KEY);
    // Same Jira key in a different connected project is a different resource.
    expect(
      buildT3TeamWorkItemDedupeKey({
        provider: "atlassian",
        projectId: "project-2",
        workItemKey: "NXAI-8",
      }),
    ).not.toBe(DEDUPE_KEY);
  });

  it("collapses the same work item enqueued through both paths to one attachment", () => {
    // Path 1: whatever the composer carried into the kickoff.
    enqueueThreadKickoffAttachments(THREAD_ID, [workItemAttachment()]);
    // Path 2: the ticket aside's auto-attach, a moment later, with its own attachment id and label.
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(THREAD_ID, workItemAttachment({ label: "NXAI-8 Dev-Rolle (Story)" }));

    expect(threadAttachments()).toHaveLength(1);
  });

  /**
   * The regression this replaces: a keyless attachment cannot be deduped at all, because both store
   * guards return early when `dedupeKey` is missing. That is why the kickoff's hand-rolled request —
   * which omitted the key — produced a second chip AND a second copy in the turn context.
   */
  it("cannot dedupe an attachment that carries no key", () => {
    const { dedupeKey: _omitted, ...keyless } = workItemAttachment();
    enqueueThreadKickoffAttachments(THREAD_ID, [keyless as T3TeamContextAttachment]);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(THREAD_ID, { ...keyless, id: "attachment-second" } as never);

    expect(threadAttachments()).toHaveLength(2);
  });

  /**
   * Item the UI never showed: the store list IS the turn's context. `prepareThreadContextAttachments`
   * returns it verbatim and `runThreadBootstrapKickoff` folds every `contextText` into the kickoff
   * message, so the duplicate was not cosmetic — the model received the whole bundle twice.
   */
  it("sends the work item's context once, not twice", () => {
    enqueueThreadKickoffAttachments(THREAD_ID, [workItemAttachment()]);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(THREAD_ID, workItemAttachment({ label: "NXAI-8 Dev-Rolle (Story)" }));

    const prompt = appendContextAttachmentsToPrompt("Rewrite the description.", threadAttachments());

    expect(prompt.split("NXAI-8 context bundle")).toHaveLength(2);
  });

  it("keeps genuinely different resources apart", () => {
    enqueueThreadKickoffAttachments(THREAD_ID, [workItemAttachment()]);
    useT3TeamAddToChatStore.getState().enqueueThreadAttachment(
      THREAD_ID,
      workItemAttachment({
        label: "NXAI-6 Rollendefinitionen",
        dedupeKey: buildT3TeamWorkItemDedupeKey({
          provider: "atlassian",
          projectId: "project-1",
          workItemKey: "NXAI-6",
        }),
      }),
    );

    expect(threadAttachments()).toHaveLength(2);
  });
});
