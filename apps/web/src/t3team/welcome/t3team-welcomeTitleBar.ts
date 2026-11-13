import { isMacPlatform } from "~/lib/utils";

export type WelcomeTitleAlign = "center" | "start";

/**
 * macOS: a centered title with traffic lights, the platform convention.
 * Windows and Linux: left-aligned, the same as the main app title bar
 * (`getT3TeamMainContentHeaderClassName` / `WorkspacePageHeader`).
 */
export function welcomeTitleAlign(platform: string): WelcomeTitleAlign {
  return isMacPlatform(platform) ? "center" : "start";
}

export function welcomeTitleBarHeaderClass(align: WelcomeTitleAlign): string {
  return align === "center"
    ? "relative justify-center border-b border-border/50"
    : "justify-start border-b border-border/50";
}

export function welcomeTitleTextClass(align: WelcomeTitleAlign): string {
  const base = "text-sm font-medium text-muted-foreground/70";
  // Absolute inset centering is the visual center of the window, so traffic
  // lights on the left (and overlay controls on the right) do not shift it.
  return align === "center"
    ? `pointer-events-none absolute inset-0 flex items-center justify-center ${base}`
    : base;
}
