// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { TicketDetailDraftDocumentReview } from "~/t3work/t3work-TicketDetailDraftDocumentReview";
import { useT3WorkDraftMutationStore } from "~/t3work/t3work-draftMutationStore";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  useT3WorkDraftMutationStore.setState({ drafts: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("TicketDetailDraftDocumentReview", () => {
  it("mounts without looping when no matching drafts exist", () => {
    expect(() => {
      act(() => {
        root?.render(
          <TicketDetailDraftDocumentReview projectId="project-alpha" issueIdOrKey="ALPHA-42" />,
        );
      });
    }).not.toThrow();
  });
});
