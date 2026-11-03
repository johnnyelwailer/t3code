import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

function renderedFills(provider: string): ReadonlyArray<string> {
  const markup = renderToStaticMarkup(<ProviderIcon provider={provider} size={16} />);
  return Array.from(markup.matchAll(/<path fill="([^"]+)"/g), (match) => match[1] ?? "");
}

it("shows the Nexplore AI mark for the nexplore driver", () => {
  expect(renderedFills("nexplore")).toEqual([NEXPLORE_ORANGE]);
});

it("keeps the generic fallback glyph for a driver without an icon", () => {
  const fills = renderedFills("some-unknown-driver");
  expect(fills).not.toContain(NEXPLORE_ORANGE);
  expect(fills.length).toBeGreaterThan(0);
});
