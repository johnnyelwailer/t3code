import type { EnvironmentAppearance } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

const COLOR_VARIABLES: Readonly<Record<string, string>> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  info: "--info",
  infoForeground: "--info-foreground",
  success: "--success",
  successForeground: "--success-foreground",
  warning: "--warning",
  warningForeground: "--warning-foreground",
  appChromeBackground: "--app-chrome-background",
};
const STYLE_ID = "t3work-pack-theme";
let activeAppearance: EnvironmentAppearance | undefined;
let listeners: Array<() => void> = [];

const declarations = (colors: Readonly<Record<string, string>>): string =>
  Object.entries(colors)
    .flatMap(([key, value]) => (COLOR_VARIABLES[key] ? [`${COLOR_VARIABLES[key]}:${value}`] : []))
    .join(";");

function themeCss(appearance: EnvironmentAppearance): string {
  const sans = appearance.typography?.sans
    ? `--t3work-font-sans:${appearance.typography.sans};`
    : "";
  const mono = appearance.typography?.mono
    ? `--t3work-font-mono:${appearance.typography.mono};`
    : "";
  const radius = appearance.shape?.radius ? `--radius:${appearance.shape.radius};` : "";
  const density = appearance.density ? `font-size:${appearance.density * 100}%;` : "";
  return `:root{${declarations(appearance.colors.light)};${sans}${mono}${radius}${density}}
    :root.dark{${declarations(appearance.colors.dark)}}
    body{font-family:var(--t3work-font-sans,"DM Sans Variable",sans-serif)}
    code,kbd,pre,samp{font-family:var(--t3work-font-mono,"DM Mono",monospace)}`;
}

export function applyT3workPackAppearance(appearance: EnvironmentAppearance | undefined): void {
  activeAppearance = appearance;
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!appearance) style?.remove();
  else {
    style ??= Object.assign(document.createElement("style"), { id: STYLE_ID });
    style.textContent = themeCss(appearance);
    if (!style.isConnected) document.head.append(style);
    document.documentElement.dataset.t3workTheme = appearance.themeId;
  }
  for (const listener of listeners) listener();
}

export function useT3workPackAppearance(): EnvironmentAppearance | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
    () => activeAppearance,
    () => undefined,
  );
}
