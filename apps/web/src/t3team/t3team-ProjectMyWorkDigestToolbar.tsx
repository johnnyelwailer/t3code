import { EllipsisIcon, Sparkles } from "lucide-react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import type { DigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type DigestArrangement =
  | { readonly state: "off" }
  | { readonly state: "starting" }
  | { readonly state: "live"; readonly plan: DigestPlan; readonly refreshing: boolean }
  | { readonly state: "paused"; readonly plan: DigestPlan }
  | { readonly state: "error"; readonly plan?: DigestPlan; readonly message: string };

const MENU_ITEM_CLASS = "min-h-8 rounded-md py-1.5 text-[12px]";

function ArrangementMenu({
  arrangement,
  onPause,
  onResume,
}: {
  arrangement: Extract<DigestArrangement, { state: "live" | "paused" }>;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
        aria-label="Auto-arrange options"
      >
        <EllipsisIcon className="size-4" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        side="bottom"
        className="min-w-[13rem] border-border/80 bg-background/95"
      >
        {arrangement.state === "live" ? (
          <MenuItem className={MENU_ITEM_CLASS} onClick={onPause}>
            Pause auto-arrange
          </MenuItem>
        ) : (
          <MenuItem className={MENU_ITEM_CLASS} onClick={onResume}>
            Resume auto-arrange
          </MenuItem>
        )}
        <MenuItem className={MENU_ITEM_CLASS}>Open workflow thread</MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function ArrangementStatus({
  arrangement,
  newSinceCount,
  nowMs,
}: {
  arrangement: DigestArrangement;
  newSinceCount: number;
  nowMs: number;
}) {
  if (arrangement.state !== "live" && arrangement.state !== "paused") return null;
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
      {arrangement.state === "live" && arrangement.refreshing ? (
        <Spinner className="size-3" />
      ) : null}
      <span
        className={`size-1.5 rounded-full ${arrangement.state === "live" ? "bg-success" : "bg-muted-foreground/50"}`}
      />
      <span>
        {arrangement.state === "paused" ? "paused" : "auto"} · updated{" "}
        {formatDigestAgo(nowMs, arrangement.plan.producedAt)} ago
      </span>
      {newSinceCount > 0 ? (
        <Badge variant="info" size="sm">
          {newSinceCount} new
        </Badge>
      ) : null}
    </span>
  );
}

export function ProjectMyWorkDigestToolbar({
  arrangement,
  newSinceCount,
  nowMs,
  graphEmpty,
  onStart,
  onPause,
  onResume,
}: {
  arrangement: DigestArrangement;
  newSinceCount: number;
  nowMs: number;
  graphEmpty: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 sm:gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ArrangementStatus arrangement={arrangement} newSinceCount={newSinceCount} nowMs={nowMs} />
        {arrangement.state === "off" ? (
          <Button size="sm" disabled={graphEmpty} onClick={onStart}>
            <Sparkles /> Arrange for me
          </Button>
        ) : null}
        {arrangement.state === "starting" ? (
          <Button size="sm" variant="outline" disabled>
            <Spinner className="size-3.5" /> Starting
          </Button>
        ) : null}
        {arrangement.state === "error" ? (
          <>
            <Badge variant="error">auto-arrange failed · fallback</Badge>
            <Button size="sm" variant="outline" onClick={onStart}>
              Retry
            </Button>
          </>
        ) : null}
        {arrangement.state === "live" || arrangement.state === "paused" ? (
          <ArrangementMenu arrangement={arrangement} onPause={onPause} onResume={onResume} />
        ) : null}
      </div>
    </div>
  );
}
