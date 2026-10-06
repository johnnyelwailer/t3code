// @vitest-environment jsdom
/**
 * Picking a project in the sidebar's scope disc must carry onto the active My work / Backlog
 * board, and only there. The hook is driven with the same (scope key, group id) pair Sidebar.tsx
 * passes it, against a stand-in router.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const router = vi.hoisted(() => ({
  state: { location: { pathname: "/", search: {} as Record<string, unknown> } },
  navigate: vi.fn(async (_target: unknown) => undefined),
}));

vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));

import { useT3TeamScopeRouteSync } from "./t3team-useScopeRouteSync";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ scopeKey, projectId }: { scopeKey: string | null; projectId: string | null }) {
  useT3TeamScopeRouteSync(scopeKey, projectId);
  return null;
}

describe("useT3TeamScopeRouteSync", () => {
  let root: Root;

  const render = (scopeKey: string | null, projectId: string | null) =>
    act(async () => {
      root.render(<Probe scopeKey={scopeKey} projectId={projectId} />);
    });
  const locate = (pathname: string, search: Record<string, unknown> = {}) => {
    router.state.location = { pathname, search };
  };

  beforeEach(() => {
    router.navigate.mockClear();
    locate("/");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("re-targets the my-work board to the picked project", async () => {
    locate("/t3team/my-work");
    await render(null, null);
    await render("key-b", "proj-b");
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/t3team/projects/$projectId",
      params: { projectId: "proj-b" },
      search: { projectView: "my-work" },
    });
  });

  it("keeps the backlog board and returns to all-projects my-work on All", async () => {
    locate("/t3team/projects/proj-a", { projectView: "backlog" });
    await render("key-a", "proj-a");
    await render("key-b", "proj-b");
    expect(router.navigate).toHaveBeenLastCalledWith({
      to: "/t3team/projects/$projectId",
      params: { projectId: "proj-b" },
      search: { projectView: "backlog" },
    });
    await render(null, null);
    expect(router.navigate).toHaveBeenLastCalledWith({ to: "/t3team/my-work" });
  });

  it("does not navigate for a scope restored at startup", async () => {
    locate("/t3team/my-work");
    await render("key-a", null);
    await render("key-a", "proj-a");
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("does not treat a stale persisted scope being cleared as a pick", async () => {
    locate("/t3team/projects/proj-x", { projectView: "my-work" });
    await render("key-gone", null);
    await render(null, null);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("waits for the picked group to resolve before navigating", async () => {
    locate("/t3team/my-work");
    await render(null, null);
    await render("key-b", null);
    expect(router.navigate).not.toHaveBeenCalled();
    await render("key-b", "proj-b");
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it("leaves a thread or draft where it is", async () => {
    locate("/t3team/projects/proj-a/threads/t1");
    await render(null, null);
    await render("key-b", "proj-b");
    locate("/t3team/drafts/d1");
    await render("key-c", "proj-c");
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
