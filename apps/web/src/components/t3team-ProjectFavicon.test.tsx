import type { Dispatch, ReactElement, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { EnvironmentId } from "@t3tools/contracts";
import { ProjectIconGlyph } from "./t3team-ProjectIconGlyph";

const testState = vi.hoisted(() => ({
  faviconUrl: "https://environment.test/api/assets/token-a/v1-20-favicon.svg",
}));

const hooks = vi.hoisted(() => {
  let cursor = 0;
  let slots: unknown[] = [];
  const nextIndex = () => cursor++;

  return {
    beginRender() {
      cursor = 0;
    },
    reset() {
      cursor = 0;
      slots = [];
    },
    useMemoCache(size: number): unknown[] {
      const index = nextIndex();
      if (!slots[index]) {
        slots[index] = Array.from({ length: size }, () => Symbol.for("react.memo_cache_sentinel"));
      }
      return slots[index] as unknown[];
    },
    useState<T>(initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
      const index = nextIndex();
      if (index >= slots.length) {
        slots[index] =
          typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
      }
      const setValue: Dispatch<SetStateAction<T>> = (nextValue) => {
        const previous = slots[index] as T;
        slots[index] =
          typeof nextValue === "function" ? (nextValue as (value: T) => T)(previous) : nextValue;
      };
      return [slots[index] as T, setValue];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: hooks.useState,
  };
});

vi.mock("react/compiler-runtime", () => ({ c: hooks.useMemoCache }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => testState.faviconUrl,
}));
vi.mock("../state/assets", () => ({ projectFaviconUrlAtom: () => null }));

import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";

function makeProject(
  overrides: Partial<ProjectFaviconProject> &
    Pick<ProjectFaviconProject, "workspaceRoot" | "title">,
): ProjectFaviconProject {
  return { environmentId: "environment-test" as EnvironmentId, ...overrides };
}

describe("ProjectFavicon (t3team project icon override)", () => {
  beforeEach(() => {
    hooks.reset();
  });

  it("renders a saved Lucide icon ahead of an uploaded favicon", () => {
    const icon = { kind: "lucide", name: "alarm-clock", color: "violet" } as const;
    const element = ProjectFavicon({
      project: makeProject({
        workspaceRoot: "/workspace/test",
        title: "test",
        faviconPath: "brand/icon.svg",
        projectIcon: icon,
      }),
    }) as ReactElement<{ readonly icon: unknown }>;

    expect(element.type).toBe(ProjectIconGlyph);
    expect(element.props.icon).toEqual(icon);
  });

  it("renders a saved emoji ahead of an uploaded favicon", () => {
    const icon = { kind: "emoji", emoji: "🦄" } as const;
    const element = ProjectFavicon({
      project: makeProject({
        workspaceRoot: "/workspace/test",
        title: "test",
        faviconPath: "brand/icon.svg",
        projectIcon: icon,
      }),
    }) as ReactElement<{ readonly icon: unknown }>;

    expect(element.type).toBe(ProjectIconGlyph);
    expect(element.props.icon).toEqual(icon);
  });
});
