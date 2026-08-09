/**
 * The duplicate chip, reproduced from the two writers that actually produced it.
 *
 * WRITER A — the ticket aside's auto-attach:
 *   `t3team-useTicketDetailEmbeddedThreadEffects.ts:59` → `takeEmbeddedTicketThreadAutoAttach`
 *   → `buildTicketSidebarAddToChatRequest` (`t3team-projectSidebarAddToChatRequests.ts`), which sets
 *   `request.dedupeKey`.
 *
 * WRITER B — the work-item context sync queue:
 *   `t3team-useWorkItemContextSyncQueue.ts:91-112` builds its own request with NO `dedupeKey`, so the key
 *   falls back to the one on the directory-bundle PAYLOAD from `t3team-refreshWorkItemContextBundle.ts:24`.
 *
 * Both target `{type: "thread", threadId}`. They used to spell the same Epic's key differently, and
 * `hasThreadAttachmentDuplicate` only matches on an exact string — so both landed, which is the `array(2)`
 * in one `ContextAttachmentStrip`. This asserts on the STORE, because the store list is what becomes the
 * turn's context: a render-side filter would have left the model receiving the bundle twice.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import {
  buildContextAttachment,
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import { buildT3TeamWorkItemDedupeKey } from "~/t3team/t3team-contextAttachmentDedupeKey";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";
import { buildServerOwnedWorkItemContextBundle } from "~/t3team/t3team-refreshWorkItemContextBundle";

const THREAD_ID = "thread-1785214874172-1";
const PROJECT_ID = "project-1";
const WORK_ITEM_KEY = "NXAI-6";

function baseRequest(): AddToChatRequest {
  return {
    projectId: PROJECT_ID,
    projectTitle: "Nexi AI",
    targetLabel: `${WORK_ITEM_KEY} Rollendefinitionen`,
    targetType: "work-item",
    kind: "jira-work-item",
    payload: undefined,
  };
}

/** Writer A: the request carries the canonical key explicitly. */
function writerARequest(): AddToChatRequest {
  return {
    ...baseRequest(),
    dedupeKey: buildT3TeamWorkItemDedupeKey({
      projectId: PROJECT_ID,
      workItemKey: WORK_ITEM_KEY,
    }),
  };
}

/** Writer B: no request key — it must inherit the payload's, and they must agree. */
function writerBPayload() {
  return buildServerOwnedWorkItemContextBundle({
    projectId: PROJECT_ID,
    ticketKey: WORK_ITEM_KEY,
    targetLabel: `${WORK_ITEM_KEY} Rollendefinitionen`,
    summaryItems: [{ label: "Issue type", value: "Epic" }],
    entryPointRelativePath: `.t3team/context/jira/${PROJECT_ID}/items/nxai-6/entrypoint.json`,
  });
}

function threadAttachments() {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[THREAD_ID] ?? [];
}

describe("the same work item arriving from both writers", () => {
  beforeEach(() => {
    useT3TeamAddToChatStore.setState({
      pendingByProjectId: {},
      pendingByKickoffKey: {},
      threadAttachmentsByThreadId: {},
    });
  });

  it("agrees on the key across the request builder and the bundle payload", () => {
    const fromRequest = writerARequest().dedupeKey;
    const fromPayload = writerBPayload().dedupeKey;

    // The regression: two producers, two spellings, dedupe silently disabled.
    expect(fromPayload).toBe(fromRequest);
  });

  /**
   * The real sequence, which the add-time guard could never catch.
   *
   * `useAddToChat` enqueues a PENDING attachment built by `buildPendingContextAttachment` — which is called
   * WITHOUT the payload, so a request that omits `dedupeKey` produces a keyless entry that dedupes against
   * nothing. The key only materialises later, when the sync resolves and the entry is REPLACED. Two
   * identical chips, both `synced`, is what that looks like.
   */
  it("leaves ONE attachment when writer B is enqueued keyless and keyed on sync", () => {
    const requestA = writerARequest();
    const requestB = baseRequest();
    const payloadB = writerBPayload();

    // Writer A: the aside auto-attaches, already keyed.
    enqueueThreadKickoffAttachments(THREAD_ID, [
      buildPendingContextAttachment({ id: "attachment-a", request: requestA }),
    ]);
    // Writer B: the sync queue enqueues its pending entry.
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(
        THREAD_ID,
        buildPendingContextAttachment({ id: "attachment-b", request: requestB }),
      );

    // ...then B's bundle resolves and the entry is replaced, now carrying the resource's key.
    useT3TeamAddToChatStore
      .getState()
      .replaceThreadAttachment(
        THREAD_ID,
        "attachment-b",
        buildContextAttachment({ id: "attachment-b", request: requestB, payload: payloadB }),
      );

    expect(threadAttachments()).toHaveLength(1);
    // First writer wins — the entry the user already saw.
    expect(threadAttachments()[0]?.id).toBe("attachment-a");
  });

  it("leaves ONE attachment when both writers carry the key up front", () => {
    const keyed = writerARequest();
    enqueueThreadKickoffAttachments(THREAD_ID, [
      buildPendingContextAttachment({ id: "attachment-a", request: keyed }),
    ]);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(
        THREAD_ID,
        buildPendingContextAttachment({ id: "attachment-b", request: keyed }),
      );

    expect(threadAttachments()).toHaveLength(1);
  });

  /**
   * The path the add-time guard never covered: a REPLACEMENT (what the sync progress updates use) can carry
   * a key that already exists elsewhere in the list.
   */
  it("collapses a replacement that collides with another entry's key", () => {
    const keyless = buildContextAttachment({ id: "attachment-keyless", request: baseRequest() });
    const keyed = buildContextAttachment({ id: "attachment-a", request: writerARequest() });
    enqueueThreadKickoffAttachments(THREAD_ID, [keyless, keyed]);
    expect(threadAttachments()).toHaveLength(2);

    // The keyless entry re-syncs and now resolves to the same resource.
    useT3TeamAddToChatStore
      .getState()
      .replaceThreadAttachment(
        THREAD_ID,
        "attachment-keyless",
        buildContextAttachment({ id: "attachment-keyless", request: writerARequest() }),
      );

    expect(threadAttachments()).toHaveLength(1);
  });

  it("still keeps genuinely different work items apart", () => {
    const epic = buildContextAttachment({ id: "attachment-a", request: writerARequest() });
    const story = buildContextAttachment({
      id: "attachment-c",
      request: {
        ...baseRequest(),
        targetLabel: "NXAI-8 Dev-Rolle",
        dedupeKey: buildT3TeamWorkItemDedupeKey({
          projectId: PROJECT_ID,
          workItemKey: "NXAI-8",
        }),
      },
    });

    enqueueThreadKickoffAttachments(THREAD_ID, [epic, story]);

    expect(threadAttachments()).toHaveLength(2);
  });
});
