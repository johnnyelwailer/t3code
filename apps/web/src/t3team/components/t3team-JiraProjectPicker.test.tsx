// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  jiraCatalogEntryKey,
  type JiraCatalogProject,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";

import { JiraProjectPicker } from "./t3team-JiraProjectPicker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = (
  accountId: string,
  siteHost: string,
  id: string,
  key: string,
  title: string,
): JiraCatalogProject => ({
  entryKey: jiraCatalogEntryKey(accountId, id),
  accountId,
  provider: "atlassian",
  externalProjectId: id,
  key,
  title,
  iconUrl: undefined,
  siteHost,
});

const catalog = [
  project("a", "nexplore.atlassian.net", "1", "IES", "IES NG"),
  project("a", "nexplore.atlassian.net", "2", "HIVE", "Hive Platform"),
  project("b", "acme.atlassian.net", "1", "MOB", "Mobile Checkout"),
];
const bound = new Map([["a::1", "app-ies"]]);

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(props: Partial<React.ComponentProps<typeof JiraProjectPicker>> = {}) {
  const onChoose = vi.fn<(row: CatalogRow) => void>();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(JiraProjectPicker, {
        catalog,
        boundProjectIds: bound,
        loading: false,
        error: null,
        onRefresh: () => {},
        onChoose,
        ...props,
      }),
    );
  });
  return { host, onChoose };
}

function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const rowButtons = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>("li button")].map((button) => button.textContent);

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("JiraProjectPicker", () => {
  it("lists every site's projects in one list and puts added ones under their own heading", () => {
    const { host } = render();
    const text = host.textContent ?? "";
    expect(text).toContain("Projects");
    expect(text).toContain("Already added");
    expect(rowButtons(host)).toEqual([
      expect.stringContaining("Hive Platform"),
      expect.stringContaining("Mobile Checkout"),
      expect.stringContaining("IES NG"),
    ]);
    // Two sites: each row names its own.
    expect(text).toContain("acme.atlassian.net");
  });

  it("picks an available project", () => {
    const { host, onChoose } = render();
    act(() => host.querySelectorAll<HTMLButtonElement>("li button")[0]!.click());
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]![0]).toMatchObject({
      entry: { entryKey: "a::2" },
      existingProjectId: null,
    });
  });

  it("hands back the app project for one that is already added", () => {
    const { host, onChoose } = render();
    act(() => host.querySelectorAll<HTMLButtonElement>("li button")[2]!.click());
    expect(onChoose.mock.calls[0]![0]).toMatchObject({ existingProjectId: "app-ies" });
  });

  it("filters across sites with one query", () => {
    const { host } = render();
    type(host.querySelector("input")!, "mob");
    expect(rowButtons(host)).toEqual([expect.stringContaining("Mobile Checkout")]);
  });

  it("says so when nothing matches", () => {
    const { host } = render();
    type(host.querySelector("input")!, "zzz");
    expect(host.textContent).toContain("No project matches “zzz”.");
  });

  it("shows placeholders while the first read is in flight", () => {
    const { host } = render({ catalog: [], loading: true });
    expect(host.querySelectorAll("li")).toHaveLength(0);
    expect(host.textContent).not.toContain("No projects found");
  });

  it("offers a retry when loading failed and there is nothing cached", () => {
    const { host } = render({ catalog: [], error: new Error("boom") });
    expect(host.textContent?.toLowerCase()).toContain("try again");
  });

  it("marks the current choice for pick-then-confirm callers", () => {
    const { host } = render({ selectedEntryKey: "a::2" });
    const selected = host.querySelectorAll('li button[aria-current="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toContain("Hive Platform");
  });
});
