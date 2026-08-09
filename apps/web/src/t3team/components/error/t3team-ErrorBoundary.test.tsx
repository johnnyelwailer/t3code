// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { T3TeamErrorBoundary } from "./t3team-ErrorBoundary";

function Bomb(): never {
  throw new Error("Request failed with 500");
}

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = [];

async function renderNode(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
});

describe("T3TeamErrorBoundary", () => {
  it("renders children when nothing has thrown", async () => {
    const container = await renderNode(
      <T3TeamErrorBoundary>
        <div>section content</div>
      </T3TeamErrorBoundary>,
    );

    expect(container.textContent).toContain("section content");
  });

  it("renders T3TeamErrorState when a child throws", async () => {
    const container = await renderNode(
      <T3TeamErrorBoundary>
        <Bomb />
      </T3TeamErrorBoundary>,
    );

    expect(container.textContent).toContain("Something went wrong on our end.");
  });

  it("delegates to a caller-supplied fallback render prop instead", async () => {
    const container = await renderNode(
      <T3TeamErrorBoundary fallback={() => <div>custom fallback</div>}>
        <Bomb />
      </T3TeamErrorBoundary>,
    );

    expect(container.textContent).toContain("custom fallback");
    expect(container.textContent).not.toContain("Something went wrong");
  });

  it("resets and re-renders children after retrying", async () => {
    let shouldThrow = true;
    function MaybeBomb() {
      if (shouldThrow) throw new Error("Request failed with 500");
      return <div>recovered content</div>;
    }

    const container = await renderNode(
      <T3TeamErrorBoundary>
        <MaybeBomb />
      </T3TeamErrorBoundary>,
    );
    expect(container.textContent).toContain("Something went wrong on our end.");

    shouldThrow = false;
    const retryButton = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Try again",
    );
    expect(retryButton).toBeDefined();
    await act(async () => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("recovered content");
  });
});
