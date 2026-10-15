// @vitest-environment jsdom

import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { BranchToolbarEnvironmentSelector } from "./BranchToolbarEnvironmentSelector";

// A real mouse click: Base UI opens a Select on mousedown, one animation frame later.
async function press(element: Element) {
  const init = { bubbles: true, cancelable: true, button: 0 };
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mousedown", init));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse" }));
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.dispatchEvent(new MouseEvent("click", init));
  });
}

// The panel's "Run on" row on the REAL Select (no stand-in): it must be the menu's own trigger, so
// a click opens it anchored under the row. A bare row button left it closed, or open at (0, 0).
it.each([
  ["a started thread moves", true, "Move to"],
  ["a draft re-targets", false, "Run on"],
] as const)("opens the panel Run-on row as a real dropdown where %s", async (_, started, label) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onEnvironmentChange = vi.fn();
  const onHandoffToEnvironment = vi.fn();
  const onCreateCloudSession = vi.fn();
  const measure = HTMLElement.prototype.getBoundingClientRect;
  const spies = [
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("aria-label") === "Run on"
        ? DOMRect.fromRect({ x: 40, y: 300, width: 220, height: 28 })
        : measure.call(this);
    }),
    // jsdom has no layout: give the viewport room below the row, as the panel has.
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800),
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1200),
  ];
  try {
    await act(async () => {
      root.render(
        <BranchToolbarEnvironmentSelector
          displayMode="panel"
          envLocked={started}
          environmentId={EnvironmentId.make("local")}
          availableEnvironments={["local", "remote"].map((id) => ({
            environmentId: EnvironmentId.make(id),
            projectId: ProjectId.make("project"),
            label: id,
            isPrimary: id === "local",
            machine: "server",
          }))}
          onCreateCloudSession={onCreateCloudSession}
          {...(started ? { onHandoffToEnvironment } : { onEnvironmentChange })}
        />,
      );
    });
    const row = container.querySelector('[aria-label="Run on"]')!;
    expect(row.getAttribute("aria-haspopup")).toBe("listbox");
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await press(row);
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(listbox).not.toBeNull();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(listbox.textContent).toContain(label);
    expect(listbox.textContent).toContain("New cloud session");
    const options = [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual(["local", "remote"]);
    const positioner = listbox.closest<HTMLElement>('[data-slot="select-positioner"]')!;
    // Under the row (y 300 + height 28 + 4px offset) and as wide as it, not at (0, 0).
    expect(positioner.getAttribute("data-side")).toBe("bottom");
    expect(positioner.style.transform).toBe("translate(40px, 332px)");
    expect(positioner.style.getPropertyValue("--anchor-width")).toBe("220px");

    await press(options[1]!);
    if (started) {
      expect(onHandoffToEnvironment).toHaveBeenCalledExactlyOnceWith("remote");
      expect(onEnvironmentChange).not.toHaveBeenCalled();
    } else {
      expect(onEnvironmentChange).toHaveBeenCalledExactlyOnceWith("remote");
      expect(onHandoffToEnvironment).not.toHaveBeenCalled();
    }

    await press(row);
    const create = [...document.querySelectorAll<HTMLElement>('[role="listbox"] button')].find(
      (button) => button.textContent?.includes("New cloud session"),
    )!;
    await press(create);
    expect(onCreateCloudSession).toHaveBeenCalledExactlyOnceWith({ selectAsTarget: !started });

    // Escape closes it again.
    await press(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
  } finally {
    for (const spy of spies) spy.mockRestore();
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
