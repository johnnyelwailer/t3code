import "~/index.css";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { DiffExplorerFileTree } from "./t3team-DiffExplorerFileTree";

vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
const files = [
  { key: "a", path: "src/a.ts", oldPath: null, additions: 3, deletions: 1 },
  { key: "b", path: "src/b.ts", oldPath: null, additions: 0, deletions: 2 },
];
function tree(onSelectFile = vi.fn(), onToggleViewed = vi.fn(), onToggleDirectoryViewed = vi.fn()) {
  return (
    <div style={{ height: 400, width: 500, display: "flex" }}>
      <DiffExplorerFileTree
        files={files}
        entries={files.map((file) => ({ path: file.path, status: "modified" }))}
        reviewControlsEnabled
        selectedKey="a"
        viewed={new Set(["a"])}
        changed={new Set(["a"])}
        onSelectFile={onSelectFile}
        onToggleViewed={onToggleViewed}
        onToggleDirectoryViewed={onToggleDirectoryViewed}
        onMarkAllViewed={vi.fn()}
        ariaLabel="PR files"
        side="right"
        onSwapSide={vi.fn()}
      />
    </div>
  );
}

describe("PR review on upstream file tree", () => {
  it("renders Pierre's tree and slots viewed controls into real file and folder rows", async () => {
    localStorage.removeItem("t3code.pullRequestFileTreeFullPaths");
    await using screen = await render(tree(), { router: false });
    await expect
      .element(screen.getByRole("checkbox", { name: "Mark src/a.ts as not viewed" }))
      .toBeVisible();
    const host = screen.container.querySelector("file-tree-container");
    expect(host?.shadowRoot?.querySelector('[data-item-path="src/a.ts"]')).not.toBeNull();
    const slot = host?.shadowRoot?.querySelector<HTMLSlotElement>(
      'slot[name="diff-review-src/a.ts"]',
    );
    expect(slot?.assignedElements().length).toBe(1);
    await expect.element(screen.getByLabelText("Changed since you viewed it")).toBeVisible();
  });

  it("checkbox clicks do not select files or collapse folders", async () => {
    localStorage.removeItem("t3code.pullRequestFileTreeFullPaths");
    const select = vi.fn(),
      toggle = vi.fn(),
      directory = vi.fn();
    await using screen = await render(tree(select, toggle, directory), { router: false });
    await screen.getByRole("checkbox", { name: "Mark src/a.ts as not viewed" }).click();
    expect(toggle).toHaveBeenCalledWith("a");
    expect(select).not.toHaveBeenCalled();
    await screen.getByRole("checkbox", { name: "Mark all files in src as viewed" }).click();
    expect(directory).toHaveBeenCalledWith("src/");
    await expect
      .element(screen.getByRole("checkbox", { name: "Mark src/b.ts as viewed" }))
      .toBeVisible();
    expect(select).not.toHaveBeenCalled();
  });

  it("uses upstream keyboard navigation and keeps full-path list mode", async () => {
    localStorage.removeItem("t3code.pullRequestFileTreeFullPaths");
    const select = vi.fn();
    await using screen = await render(tree(select), { router: false });
    const row = screen.container
      .querySelector("file-tree-container")
      ?.shadowRoot?.querySelector<HTMLElement>('[data-item-path="src/a.ts"]');
    if (!row) throw new Error("Missing upstream row");
    await act(async () => {
      row.click();
      row.focus();
    });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledWith("b");
    await screen.getByRole("button", { name: "Show full file paths" }).click();
    expect(screen.container.querySelector("file-tree-container")?.checkVisibility()).toBe(false);
    await expect
      .element(screen.getByRole("checkbox", { name: "Mark src/b.ts as viewed" }))
      .toBeVisible();
  });
});
