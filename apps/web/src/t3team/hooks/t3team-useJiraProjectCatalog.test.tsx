// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const listProjects = vi.fn();
const listAccounts = vi.fn();

vi.mock("~/t3team/backend/t3team-BackendContext", () => ({
  useBackend: () => ({ atlassian: { listAccounts, listProjects } }),
}));

const { resetJiraCatalogLiveRefreshForTests, useJiraProjectCatalog } =
  await import("./t3team-useJiraProjectCatalog");

const account = (id: string, accountUrl: string) => ({
  id,
  provider: "atlassian" as const,
  label: id,
  accountUrl,
});

function Probe() {
  const { siteFailures, projects, retrySite } = useJiraProjectCatalog();
  return (
    <div>
      <span data-failures={siteFailures.map((failure) => failure.accountId).join(",")} />
      <span data-projects={projects.map((project) => project.entryKey).join(",")} />
      <button type="button" onClick={() => retrySite("acc-b")}>
        retry
      </button>
    </div>
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetJiraCatalogLiveRefreshForTests();
  window.localStorage.clear();
  listProjects.mockReset();
  listAccounts.mockReset();
  listAccounts.mockResolvedValue([
    account("acc-a", "https://nexwork.atlassian.net"),
    account("acc-b", "https://broken.atlassian.net"),
  ]);
  listProjects.mockImplementation(async ({ id }: { id: string }) => {
    if (id === "acc-b") throw new Error("site down");
    return [{ id: "1", provider: "atlassian", key: "NEX", title: "Nex" }];
  });
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("useJiraProjectCatalog", () => {
  it("exposes the failed site and retries only that site", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("[data-failures]")?.getAttribute("data-failures")).toBe("acc-b");
    expect(container.querySelector("[data-projects]")?.getAttribute("data-projects")).toContain(
      "acc-a::1",
    );
    expect(container.querySelector("[data-projects]")?.getAttribute("data-projects")).not.toContain(
      "acc-b",
    );

    listProjects.mockImplementation(async () => [
      { id: "2", provider: "atlassian", key: "FIX", title: "Fixed" },
    ]);
    const callsBefore = listProjects.mock.calls.length;
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const retried = listProjects.mock.calls.slice(callsBefore);
    expect(retried.map((call) => call[0])).toEqual([{ id: "acc-b", provider: "atlassian" }]);
    expect(container.querySelector("[data-failures]")?.getAttribute("data-failures")).toBe("");
  });
});
