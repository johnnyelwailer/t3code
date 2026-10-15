import {
  T3_CODE_DARK_THEME_COLORS,
  T3_CODE_LIGHT_THEME_COLORS,
  type ThemeColors,
} from "@t3tools/shared/themePalettes";

/** Semantic palette of the Nexplore distribution pack (themes/nexplore.json). */
interface NexiPackPalette {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly popover: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
  readonly info: string;
  readonly infoForeground: string;
  readonly warning: string;
  readonly warningForeground: string;
  readonly appChromeBackground: string;
  /** Mobile-only: settings groups and selected rows, tuned to stand off the chrome. */
  readonly groupedSurface: string;
  /** Mobile-only: drawer/sidebar, kept at least 1.06:1 from the canvas. */
  readonly sidebar: string;
}

export const NEXI_PRIMARY_COLOR = "#f05a0a";

// White on the brand orange is 3.4:1, so filled actions use a deeper tone that meets WCAG AA.
const NEXI_ACTION_COLOR = "#cc4c08";
const NEXI_ACTION_HOVER_COLOR = "#b84407";

const NEXI_LIGHT_PACK: NexiPackPalette = {
  background: "#faf9fb",
  foreground: "#1c1b21",
  card: "#ffffff",
  popover: "#ffffff",
  primary: NEXI_PRIMARY_COLOR,
  primaryForeground: "#ffffff",
  secondary: "#f1eff2",
  secondaryForeground: "#35323e",
  muted: "#efedf1",
  mutedForeground: "#6b6873",
  accent: "#fdece1",
  accentForeground: "#9b3a00",
  destructive: "#d92d20",
  destructiveForeground: "#9b1c13",
  border: "#e6e2e8",
  input: "#d9d4dd",
  ring: NEXI_PRIMARY_COLOR,
  info: "#4c3cf6",
  infoForeground: "#372cc0",
  warning: "#d97706",
  warningForeground: "#9a4f04",
  appChromeBackground: "#f5f3f6",
  groupedSurface: "#ece9ee",
  sidebar: "#f5f3f6",
};

const NEXI_DARK_PACK: NexiPackPalette = {
  background: "#17181c",
  foreground: "#e9e9ec",
  card: "#1e2024",
  popover: "#212327",
  primary: NEXI_PRIMARY_COLOR,
  primaryForeground: "#ffffff",
  secondary: "#272a30",
  secondaryForeground: "#e4e4e8",
  muted: "#23252a",
  mutedForeground: "#9a9ca3",
  accent: "#2b2e35",
  accentForeground: "#f0e9e4",
  destructive: "#f04438",
  destructiveForeground: "#ff9b94",
  border: "#2d3037",
  input: "#363940",
  ring: NEXI_PRIMARY_COLOR,
  info: "#6b78e6",
  infoForeground: "#aab2f2",
  warning: "#f59e0b",
  warningForeground: "#f8c661",
  appChromeBackground: "#121316",
  groupedSurface: "#272a30",
  sidebar: "#0f1012",
};

function toThemeColors(base: ThemeColors, pack: NexiPackPalette): ThemeColors {
  return {
    ...base,
    canvas: pack.background,
    chrome: pack.appChromeBackground,
    toolbar: pack.background,
    toolbarForeground: pack.foreground,
    toolbarBorder: pack.border,
    toolbarControl: pack.card,
    toolbarControlForeground: pack.foreground,
    toolbarControlHover: pack.groupedSurface,
    surface: pack.card,
    surfaceRaised: pack.card,
    surfaceOverlay: pack.popover,
    text: pack.foreground,
    textMuted: pack.mutedForeground,
    border: pack.border,
    input: pack.input,
    focus: pack.ring,
    accent: pack.primary,
    accentForeground: pack.primaryForeground,
    secondary: pack.secondary,
    secondaryForeground: pack.secondaryForeground,
    muted: pack.muted,
    mutedForeground: pack.mutedForeground,
    placeholder: pack.mutedForeground,
    secondaryLabel: pack.mutedForeground,
    iconMuted: pack.mutedForeground,
    error: pack.destructive,
    errorForeground: pack.destructiveForeground,
    warning: pack.warning,
    warningForeground: pack.warningForeground,
    update: pack.info,
    updateForeground: pack.infoForeground,
    accentSurface: pack.accent,
    accentSurfaceForeground: pack.accentForeground,
    messageSurface: pack.muted,
    messageForeground: pack.foreground,
    messageAction: NEXI_ACTION_COLOR,
    messageActionForeground: pack.primaryForeground,
    messageActionHover: NEXI_ACTION_HOVER_COLOR,
    codeBackground: pack.card,
    codeForeground: pack.foreground,
    sidebar: pack.sidebar,
    sidebarForeground: pack.foreground,
    sidebarMutedForeground: pack.mutedForeground,
    sidebarControlSurface: pack.secondary,
    sidebarRowHover: pack.muted,
    sidebarRowActive: pack.groupedSurface,
    sidebarRowSelected: pack.card,
    sidebarBorder: pack.border,
    terminalBackground: pack.background,
    terminalForeground: pack.foreground,
  };
}

export const NEXI_LIGHT_THEME_COLORS = toThemeColors(T3_CODE_LIGHT_THEME_COLORS, NEXI_LIGHT_PACK);
export const NEXI_DARK_THEME_COLORS = toThemeColors(T3_CODE_DARK_THEME_COLORS, NEXI_DARK_PACK);
