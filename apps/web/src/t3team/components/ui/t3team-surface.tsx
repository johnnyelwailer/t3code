import type { ComponentPropsWithoutRef } from "react";
import { Card, CardContent } from "~/t3team/components/ui/t3team-card";
import { cn } from "~/t3team/lib/t3team-utils";

type SurfaceTone = "default" | "muted" | "danger";

type PanelTone = "default" | "muted" | "soft" | "inset" | "dashed";

// The looks live in the fork's Card `tone` variant; `danger` blurs its backdrop because at
// /8 opacity the wizard's hero art would bleed straight through the banner text.
const cardTones = { default: "translucent", muted: "muted", danger: "destructive" } as const;

const panelToneClasses: Record<PanelTone, string> = {
  default: "rounded-lg border border-border/75 bg-card/76",
  muted: "rounded-lg border border-border/75 bg-muted/24",
  soft: "rounded-lg border border-border/70 bg-muted/30",
  inset: "rounded-md border border-border/60 bg-muted/15",
  dashed: "rounded-lg border border-dashed border-border/80 bg-muted/26",
};

export const t3SurfaceBackdrops = {
  dashboardContent:
    "bg-gradient-to-b from-muted/18 via-muted/26 to-muted/34 dark:from-muted/22 dark:via-muted/30 dark:to-muted/38",
  ticketContent:
    "bg-gradient-to-b from-muted/20 via-muted/28 to-muted/34 dark:from-muted/24 dark:via-muted/32 dark:to-muted/38",
  ticketMainColumn:
    "bg-gradient-to-b from-muted/18 to-muted/30 dark:from-muted/22 dark:to-muted/34",
} as const;

export function T3SurfaceCard({
  tone = "default",
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Card>, "tone"> & { tone?: SurfaceTone }) {
  return <Card tone={cardTones[tone]} className={className} {...props} />;
}

/** `compact` is the tighter strip inset for a banner in a section, not a panel. */
export function T3SurfaceCardContent({
  density = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CardContent> & { density?: "default" | "compact" }) {
  return (
    <CardContent size={density === "compact" ? "compact" : "sm"} className={className} {...props} />
  );
}

export function T3SurfacePanel({
  tone = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { tone?: PanelTone }) {
  return <div className={cn(panelToneClasses[tone], className)} {...props} />;
}
