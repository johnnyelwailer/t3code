/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the sibling view tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it } from "vite-plus/test";

import { LinkedRepositorySyncModal } from "~/t3team/components/t3team-LinkedRepositorySyncModal";
import type { SyncStep } from "~/t3team/components/t3team-linkedRepositorySyncSteps";
import { renderCounter } from "~/test/t3team-renderCounter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPOS = [
  "https://github.com/hive/MILO5",
  "https://github.com/hive/milo5-agentic",
  "https://github.com/hive/milo5-mocks",
  "https://github.com/hive/milo5-ops",
] as const;

function stepsWith(activeIndex: number): ReadonlyArray<SyncStep> {
  return [
    { id: "save", label: "Save the repository list", state: "done" },
    ...REPOS.map((url, index) => ({
      id: `repository:${url}`,
      label: url.split("/").pop() ?? url,
      state: (index === activeIndex
        ? "active"
        : index < activeIndex
          ? "done"
          : "pending") as SyncStep["state"],
      ...(index === activeIndex ? { detail: "Cloning — a large repository takes a while" } : {}),
    })),
    { id: "workspace", label: "Set up the workspace", state: "pending" },
  ];
}

const INITIAL = stepsWith(0);
const ADVANCED = stepsWith(1);

const counter = renderCounter();
const stableContinue = () => {};
const stableDone = () => {};
const stableBack = () => {};

const CountingModal = memo(function CountingModal(props: { steps: ReadonlyArray<SyncStep> }) {
  counter.count("modal");
  return (
    <LinkedRepositorySyncModal
      steps={props.steps}
      onContinueInBackground={stableContinue}
      onDone={stableDone}
      onBack={stableBack}
    />
  );
});

function Interactive() {
  const [tick, setTick] = useState(0);
  const [steps, setSteps] = useState(INITIAL);
  return (
    <div data-tick={tick}>
      <button type="button" data-testid="tick" onClick={() => setTick((n) => n + 1)}>
        tick
      </button>
      <button type="button" data-testid="advance" onClick={() => setSteps(ADVANCED)}>
        advance
      </button>
      <CountingModal steps={steps} />
    </div>
  );
}

describe("LinkedRepositorySyncModal re-renders", () => {
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
  });

  it("mounts the modal once for four repositories", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.expectRerendered({ modal: 1 });
  });

  it("a parent re-render with the same steps does not re-render the modal", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.reset();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="tick"]')?.click();
    });
    counter.expectRerendered({});
  });

  it("advancing one repository's step re-renders the modal once", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.reset();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="advance"]')?.click();
    });
    counter.expectRerendered({ modal: 1 });
  });
});
