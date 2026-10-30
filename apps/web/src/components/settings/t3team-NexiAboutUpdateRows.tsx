import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import {
  formatLastChecked,
  getNexiAboutStatus,
  type NexiAboutActionKind,
} from "./t3team-nexiAboutStatus.logic";

const fail = (title: string, error: unknown) =>
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An unexpected error occurred.",
    }),
  );

/** The current time, refreshed so "5 min ago" does not stay frozen at what it said on first render. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * About's row for a build that updates from GHE: where updates come from, when GHE was last
 * asked, and what the updater is doing or why it cannot. Upstream's version row above it keeps its
 * own button; this one says the state in words and offers the one action that fits it.
 */
export function NexiAboutUpdateRow() {
  const state = useDesktopUpdateState();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const now = useNow(30_000);
  const status = getNexiAboutStatus(state);
  if (!status) return null;

  const lastChecked = formatLastChecked(state?.checkedAt ?? null, now);
  const run = (work: (bridge: NonNullable<typeof window.desktopBridge>) => Promise<unknown>) => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    setPending(true);
    void work(bridge)
      .catch((error: unknown) => fail("Could not complete that update step", error))
      .then(() => setPending(false));
  };
  const act = (kind: NexiAboutActionKind) => {
    switch (kind) {
      case "open-sign-in":
        void navigate({ to: "/settings/source-control" });
        return;
      case "install-now":
        run(async (bridge) => {
          const download = await bridge.downloadUpdate();
          if (download.completed) await bridge.installUpdate();
        });
        return;
      case "restart-now":
        run((bridge) => bridge.installUpdate());
        return;
      case "retry":
      case "check":
        run((bridge) => bridge.checkForUpdate());
        return;
    }
  };

  return (
    <SettingsRow
      title="Updates from GHE"
      description={
        <span data-testid="nexi-about-update-status" data-tone={status.tone}>
          <strong>{status.label}</strong>. {status.detail} Source: GHE releases of hive/nx-nexi
          {lastChecked ? ` · last checked ${lastChecked}` : " · not checked yet"}.
        </span>
      }
      control={
        status.action ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => act(status.action!.kind)}
          >
            {status.action.label}
          </Button>
        ) : null
      }
    />
  );
}

/**
 * The update track on the GHE feed. GHE publishes one stream (full releases and release
 * candidates), so there is exactly one track to offer; Nightly is shown as not available instead of
 * a switch that would change nothing.
 */
export function NexiUpdateTrackRow() {
  return (
    <SettingsRow
      {...searchableSetting("update-track")}
      description="Stable: full releases and release candidates from GHE. Nightly builds are not published there, so there is no Nightly track for this app."
      control={<span className="text-sm text-muted-foreground">Stable</span>}
    />
  );
}
