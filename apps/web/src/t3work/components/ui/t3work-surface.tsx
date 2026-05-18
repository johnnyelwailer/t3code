import type { ComponentPropsWithoutRef } from "react";
import { Card, CardContent } from "~/t3work/components/ui/t3work-card";
import { cn } from "~/t3work/lib/t3work-utils";

type SurfaceTone = "default" | "muted" | "danger";

type PanelTone = "default" | "muted" | "soft" | "inset" | "dashed";

const cardToneClasses: Record<SurfaceTone, string> = {
  default: "border-border/80 bg-card/78",
  muted: "border-border/80 bg-muted/25",
  danger: "border-destructive/35 bg-destructive/8",
};

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
}: ComponentPropsWithoutRef<typeof Card> & { tone?: SurfaceTone }) {
  return <Card className={cn(cardToneClasses[tone], className)} {...props} />;
}

export function T3SurfaceCardContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CardContent>) {
  return <CardContent className={cn("p-4", className)} {...props} />;
}

export function T3SurfacePanel({
  tone = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { tone?: PanelTone }) {
  return <div className={cn(panelToneClasses[tone], className)} {...props} />;
}
