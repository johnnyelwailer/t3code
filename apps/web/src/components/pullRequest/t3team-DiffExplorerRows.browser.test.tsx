import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { DiffExplorerReviewAccessory } from "./t3team-DiffExplorerReviewAccessory";
import { DiffExplorerFileRow } from "./t3team-DiffExplorerFileRow";

const FILE = { key: "a", path: "src/a.ts", oldPath: null, additions: 1, deletions: 0 };

const noRouter: { readonly router: false } = { router: false };

/**
 * Clicks the checkbox the way a pointer does: on the box itself. Base UI then clicks its hidden
 * input, which is the second click that reaches the row. The box has no size here (the styles are
 * not loaded), so it is clicked through the DOM rather than at a point.
 */
async function clickCheckbox(container: HTMLElement, label: string) {
  const box = container.querySelector<HTMLElement>(`[role="checkbox"][aria-label="${label}"]`);
  if (box === null) throw new Error(`no checkbox labelled ${label}`);
  await act(async () => box.click());
}

describe("explorer row checkboxes", () => {
  it("a folder checkbox marks the folder without selecting the enclosing row", async () => {
    const onToggleViewed = vi.fn();
    const onSelect = vi.fn();
    await using screen = await render(
      <div onClick={onSelect}>
        <DiffExplorerReviewAccessory
          path="src/"
          directory
          directoryCheckbox
          descendants={[FILE]}
          viewed={new Set()}
          changed={new Set()}
          onToggleViewed={vi.fn()}
          onToggleDirectoryViewed={onToggleViewed}
        />
      </div>,
      noRouter,
    );
    await clickCheckbox(screen.container, "Mark all files in src as viewed");
    expect(onToggleViewed).toHaveBeenCalledWith("src/");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a click on a file's viewed checkbox marks it without opening the file", async () => {
    const onSelect = vi.fn();
    const onToggleViewed = vi.fn();
    await using screen = await render(
      <DiffExplorerFileRow
        file={FILE}
        selected={false}
        viewed={false}
        changed={false}
        showFullPath={false}
        onSelect={onSelect}
        onToggleViewed={onToggleViewed}
      />,
      noRouter,
    );
    await clickCheckbox(screen.container, "Mark src/a.ts as viewed");
    expect(onToggleViewed).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("flags a ticked file that changed since it was viewed", async () => {
    await using screen = await render(
      <DiffExplorerFileRow
        file={FILE}
        selected={false}
        viewed
        changed
        showFullPath={false}
        onSelect={vi.fn()}
        onToggleViewed={vi.fn()}
      />,
      noRouter,
    );
    expect(
      screen.container.querySelector('[aria-label="Changed since you viewed it"]'),
    ).not.toBeNull();
  });
});
