/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the dialog view tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";

import { LinkedRepositoryRow } from "~/t3team/components/t3team-LinkedRepositoryRows";
import { renderCounter } from "~/test/t3team-renderCounter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const GAMMA = "https://github.com/acme/gamma";
const URLS = [ALPHA, BETA, GAMMA] as const;

const counter = renderCounter();
const stableOnMakeMain = vi.fn();
const stableOnUnlink = vi.fn();

const CountingRow = memo(function CountingRow(props: {
  rowId: string;
  url: string;
  isMain: boolean;
  pending: boolean;
}) {
  counter.count(props.rowId);
  return (
    <LinkedRepositoryRow
      url={props.url}
      isMain={props.isMain}
      onMakeMain={stableOnMakeMain}
      onUnlink={stableOnUnlink}
      pending={props.pending}
    />
  );
});

function Harness({ mainUrl }: { mainUrl: string | null }) {
  return (
    <ul>
      {URLS.map((url, index) => (
        <CountingRow
          key={url}
          rowId={`row-${index}`}
          url={url}
          isMain={url === mainUrl}
          pending={false}
        />
      ))}
    </ul>
  );
}

function Interactive() {
  const [mainUrl, setMainUrl] = useState<string | null>(ALPHA);
  return (
    <div>
      <button type="button" onClick={() => setMainUrl(BETA)}>
        Make beta main
      </button>
      <Harness mainUrl={mainUrl} />
    </div>
  );
}

describe("LinkedRepositoryRow re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
    stableOnMakeMain.mockReset();
    stableOnUnlink.mockReset();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("mounts every row exactly once", async () => {
    await act(async () => {
      root.render(<Harness mainUrl={ALPHA} />);
    });
    counter.expectRerendered({ "row-0": 1, "row-1": 1, "row-2": 1 });
  });

  it("switching main re-renders only the previous and next main rows", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.reset();
    await act(async () => {
      container.querySelector("button")?.click();
    });
    counter.expectRerendered({ "row-0": 1, "row-1": 1 });
  });
});
