/**
 * Zero clicks to read the draft. It used to take three: banner → summary row → "Review in place".
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { useWorkItemDescriptionReviewOpen } from "~/t3team/workitem/t3team-useWorkItemDescriptionReviewOpen";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ISSUE = "NXAI-6";
const { mockDrafts } = vi.hoisted(() => ({ mockDrafts: vi.fn() }));

vi.mock("~/t3team/workitem/t3team-useWorkItemDrafts", () => ({
  useWorkItemDrafts: () => mockDrafts(),
}));

function mount() {
  const latest: { open: boolean | null } = { open: null };
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);

  function Harness() {
    latest.open = useWorkItemDescriptionReviewOpen(ISSUE);
    return null;
  }

  return {
    latest,
    render: async () => {
      await act(async () => root.render(<Harness />));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("useWorkItemDescriptionReviewOpen", () => {
  let harness: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    useWorkItemDraftReviewUiStore.setState({
      reviewingDescriptionForIssue: undefined,
      collapsedDescriptionReviewForIssue: undefined,
    });
    mockDrafts.mockReturnValue({ description: { id: "draft-1" } });
  });

  afterEach(async () => {
    await harness?.unmount();
    harness = null;
  });

  it("is open the moment a description draft exists, with no click", async () => {
    harness = mount();
    await harness.render();

    expect(harness.latest.open).toBe(true);
  });

  it("closes when the reader collapses it, and stays closed", async () => {
    harness = mount();
    await harness.render();

    await act(async () => {
      useWorkItemDraftReviewUiStore.getState().collapseDescriptionReview(ISSUE);
    });

    expect(harness.latest.open).toBe(false);
  });

  it("re-opens from the strip's Review in place after a collapse", async () => {
    harness = mount();
    await harness.render();
    await act(async () => {
      useWorkItemDraftReviewUiStore.getState().collapseDescriptionReview(ISSUE);
    });
    expect(harness.latest.open).toBe(false);

    await act(async () => {
      useWorkItemDraftReviewUiStore.getState().openDescriptionReview(ISSUE);
    });

    expect(harness.latest.open).toBe(true);
  });

  it("stays closed with no draft, so an ordinary description is untouched", async () => {
    mockDrafts.mockReturnValue({});
    harness = mount();
    await harness.render();

    expect(harness.latest.open).toBe(false);
  });

  it("a collapse for one issue does not collapse another's draft", async () => {
    harness = mount();
    await harness.render();

    await act(async () => {
      useWorkItemDraftReviewUiStore.getState().collapseDescriptionReview("NXAI-8");
    });

    expect(harness.latest.open).toBe(true);
  });
});
