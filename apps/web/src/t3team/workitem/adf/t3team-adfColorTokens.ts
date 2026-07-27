import type { PanelType, StatusColor } from "./t3team-adfRendererTypes";

/**
 * ADF ships two literal colour vocabularies (panel types and status lozenge colours).
 * Both are mapped here — in one place — onto the semantic tokens a workspace theme pack
 * can override (`--info`, `--success`, `--warning`, `--destructive`, `--primary`, `--muted`).
 * The renderer must never assume "blue" is blue, so the mapping is by *meaning*:
 *
 *   panel info    / status blue    -> info
 *   panel note    / status purple  -> primary   (no semantic purple exists)
 *   panel warning / status yellow  -> warning
 *   panel error   / status red     -> destructive
 *   panel success / status green   -> success
 *                   status neutral -> muted
 */
export type AdfTone = "muted" | "primary" | "info" | "warning" | "danger" | "success";

const STATUS_COLOR_TONES: Readonly<Record<StatusColor, AdfTone>> = {
  neutral: "muted",
  purple: "primary",
  blue: "info",
  red: "danger",
  yellow: "warning",
  green: "success",
};

const PANEL_TYPE_TONES: Readonly<Record<PanelType, AdfTone>> = {
  info: "info",
  note: "primary",
  warning: "warning",
  error: "danger",
  success: "success",
};

/** Inline lozenge (status, mention, date, smart-link chips). */
export const ADF_TONE_CHIP_CLASSES: Readonly<Record<AdfTone, string>> = {
  muted: "border-border/70 bg-muted/50 text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  info: "border-info/25 bg-info/10 text-info-foreground",
  warning: "border-warning/25 bg-warning/10 text-warning-foreground",
  danger: "border-destructive/25 bg-destructive/10 text-destructive-foreground",
  success: "border-success/25 bg-success/10 text-success-foreground",
};

/** Block surface (panels) — body copy stays `text-foreground` for readability. */
export const ADF_TONE_SURFACE_CLASSES: Readonly<Record<AdfTone, string>> = {
  muted: "border-border/70 bg-muted/30",
  primary: "border-primary/20 bg-primary/8",
  info: "border-info/20 bg-info/8",
  warning: "border-warning/20 bg-warning/8",
  danger: "border-destructive/20 bg-destructive/8",
  success: "border-success/20 bg-success/8",
};

/** Icon / accent colour matching a surface. */
export const ADF_TONE_ACCENT_CLASSES: Readonly<Record<AdfTone, string>> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  info: "text-info-foreground",
  warning: "text-warning-foreground",
  danger: "text-destructive-foreground",
  success: "text-success-foreground",
};

export function adfStatusTone(color: string | undefined): AdfTone {
  const key = color?.trim().toLowerCase();
  if (key !== undefined && key in STATUS_COLOR_TONES) {
    return STATUS_COLOR_TONES[key as StatusColor];
  }
  return "muted";
}

export function adfPanelTone(panelType: string | undefined): AdfTone {
  const key = panelType?.trim().toLowerCase();
  if (key !== undefined && key in PANEL_TYPE_TONES) {
    return PANEL_TYPE_TONES[key as PanelType];
  }
  return "info";
}

/**
 * `textColor` marks carry an author-chosen literal hex — genuine document content rather
 * than chrome — so it is applied inline, but only after validating the exact `#rrggbb`
 * shape the ADF schema mandates. Author *background* colours (the `backgroundColor` mark
 * and `tableCell.attrs.background`) are deliberately NOT honoured as colours: they would
 * fight a theme pack's palette and can destroy text contrast. Callers render a neutral
 * `bg-muted/*` emphasis instead, preserving "this is highlighted" without inventing a colour.
 */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function adfTextColor(color: string | undefined): string | undefined {
  const trimmed = color?.trim();
  if (trimmed === undefined || !HEX_COLOR_PATTERN.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}
