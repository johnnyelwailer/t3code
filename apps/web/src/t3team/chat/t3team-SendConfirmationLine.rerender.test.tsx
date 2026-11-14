/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the other rerender tests. */
import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";

import { renderCounter } from "~/test/t3team-renderCounter";

import { T3TeamSendConfirmationLine } from "./t3team-SendConfirmationLine";
import { markSendNotConfirmed, markSendPending, settleSend } from "./t3team-sendConfirmationStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counter = renderCounter();

// A pending line reads its environment once per render; counting there counts those renders.
vi.mock("~/state/environments", () => ({
  useEnvironment: (environmentId: string) => {
    counter.count(environmentId);
    return { connection: { phase: "reconnecting" } };
  },
}));

function Lines() {
  return (
    <>
      <T3TeamSendConfirmationLine messageId="message-a" />
      <T3TeamSendConfirmationLine messageId="message-b" />
    </>
  );
}

describe("T3TeamSendConfirmationLine re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    settleSend("message-a");
    settleSend("message-b");
  });

  it("rows with nothing pending never read the connection", async () => {
    await act(async () => {
      root.render(<Lines />);
    });
    counter.expectRerendered({});
  });

  it("a change to one send re-renders only its own line", async () => {
    await act(async () => {
      root.render(<Lines />);
    });
    await act(async () => {
      markSendPending("message-a", {
        threadId: "thread-1",
        environmentId: EnvironmentId.make("line-a"),
      });
    });
    await act(async () => {
      markSendNotConfirmed("message-a", () => {});
    });
    counter.expectRerendered({ "line-a": 2 });
  });
});
