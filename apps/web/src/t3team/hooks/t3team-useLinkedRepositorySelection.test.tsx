// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import {
  linkRepositoryUrls,
  toggleRepositoryUrl,
  useLinkedRepositorySelection,
} from "./t3team-useLinkedRepositorySelection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = "https://github.com/acme/api";
const web = "https://github.com/acme/web";

function renderSelection(initialScope: string | undefined) {
  const current: { value: ReturnType<typeof useLinkedRepositorySelection> | null } = {
    value: null,
  };
  function Probe({ scope }: { scope: string | undefined }): ReactNode {
    current.value = useLinkedRepositorySelection(scope);
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (scope: string | undefined) =>
    act(() => {
      root.render(createElement(Probe, { scope }));
    });
  render(initialScope);
  return { current, render };
}

describe("linked repository selection", () => {
  it("toggles a repository on and off", () => {
    expect(toggleRepositoryUrl([], api)).toEqual([api]);
    expect(toggleRepositoryUrl([api, web], api)).toEqual([web]);
  });

  it("links many without duplicates or blanks", () => {
    expect(linkRepositoryUrls([api], [api, web, " "])).toEqual([api, web]);
  });

  it("starts over, in the same render, when the scope changes", () => {
    const { current, render } = renderSelection("a::1");
    act(() => current.value!.toggleRepository(api));
    expect(current.value!.linkedRepositoryUrls).toEqual([api]);

    render("a::2");
    expect(current.value!.linkedRepositoryUrls).toEqual([]);

    act(() => current.value!.linkRepositories([web]));
    expect(current.value!.linkedRepositoryUrls).toEqual([web]);
  });

  it("keeps the selection while the scope stays the same", () => {
    const { current, render } = renderSelection("a::1");
    act(() => current.value!.linkRepositories([api, web]));
    render("a::1");
    expect(current.value!.linkedRepositoryUrls).toEqual([api, web]);
  });
});
