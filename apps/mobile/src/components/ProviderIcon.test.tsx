import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-svg", () => ({
  Svg: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  Path: (props: { fill?: string; d?: string }) => <path fill={props.fill} d={props.d} />,
  Defs: ({ children }: { children?: ReactNode }) => <>{children}</>,
  LinearGradient: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Stop: () => null,
}));
vi.mock("expo-image", () => ({ Image: () => <img alt="" /> }));
vi.mock("./ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));

import { ProviderIcon } from "./ProviderIcon";

const NEXPLORE_ORANGE = "#f05a0a";

async function renderedFills(provider: string): Promise<ReadonlyArray<string | null>> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ProviderIcon provider={provider} size={16} />));
    return Array.from(container.querySelectorAll("path"), (path) => path.getAttribute("fill"));
  } finally {
    await act(async () => root.unmount());
  }
}

it("shows the Nexplore AI mark for the nexplore driver", async () => {
  expect(await renderedFills("nexplore")).toEqual([NEXPLORE_ORANGE]);
});

it("keeps the generic fallback glyph for a driver without an icon", async () => {
  const fills = await renderedFills("some-unknown-driver");
  expect(fills).not.toContain(NEXPLORE_ORANGE);
  expect(fills.length).toBeGreaterThan(0);
});
