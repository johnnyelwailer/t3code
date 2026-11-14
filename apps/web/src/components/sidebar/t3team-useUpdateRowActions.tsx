import { PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import { useState } from "react";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import type { DesktopUpdateButtonAction } from "../desktopUpdate.logic";
import { UpdateEntryChip } from "./t3team-UpdateEntryChip";
import type { UpdateEntry } from "./UpdateEverythingDialog";
import type { UpdateEverythingRow } from "./updateEverything.logic";
import type { useUpdateEverything } from "./useUpdateEverything";

type RowUpdates = Pick<
  ReturnType<typeof useUpdateEverything>,
  "servers" | "updateServer" | "providerMachines" | "updateProviders"
>;

const APP_ACTIONS = {
  download: { label: "Download this app's update", icon: "download" },
  install: { label: "Restart this app to update", icon: "restart" },
} as const;

/** Update-dialog entries that update on their own: this app, one server, or one provider. */
export function useUpdateRowActions(
  updates: RowUpdates,
  action: DesktopUpdateButtonAction,
  onUpdateApp: () => void,
) {
  const enabled = useFeatureFlag("UI_UPDATE_APP_ONLY");
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  if (!enabled) return null;

  const run = (key: string, work: () => Promise<unknown>) => {
    setPending((keys) => new Set(keys).add(key));
    void work().finally(() =>
      setPending((keys) => new Set([...keys].filter((pendingKey) => pendingKey !== key))),
    );
  };

  const appEntry = (row: UpdateEverythingRow, label: string) => {
    if (row.app === "this-app") {
      if (action === "none") return null;
      const { label: actionLabel, icon } = APP_ACTIONS[action];
      const restartEnvironmentId = action === "install" ? row.environmentId : null;
      return (
        <UpdateEntryChip
          label={label}
          action={{
            label: actionLabel,
            icon,
            restartEnvironmentId,
            pending: false,
            onClick: onUpdateApp,
          }}
        />
      );
    }
    const server = updates.servers.find((target) => target.environmentId === row.environmentId);
    if (server === undefined) return null;
    const key = `${server.environmentId}:server`;
    return (
      <UpdateEntryChip
        label={label}
        action={{
          label: `Update ${row.label}`,
          icon: "update",
          restartEnvironmentId: server.environmentId,
          pending: pending.has(key),
          onClick: () => run(key, () => updates.updateServer(server)),
        }}
      />
    );
  };

  const providerEntry = (row: UpdateEverythingRow, label: string) => {
    const environmentId = row.environmentId;
    const candidate = updates.providerMachines
      .find((machine) => machine.environmentId === environmentId)
      ?.candidates.find(
        (option) => (PROVIDER_DISPLAY_NAMES[option.driver] ?? option.driver) === label,
      );
    if (environmentId === null || candidate === undefined) {
      return <UpdateEntryChip label={label} action={null} />;
    }
    const only = { environmentId, driver: candidate.driver };
    const key = `${environmentId}:provider:${candidate.driver}`;
    return (
      <UpdateEntryChip
        label={label}
        action={{
          label: `Update ${label} on ${row.label}`,
          icon: "update",
          restartEnvironmentId: null,
          pending: pending.has(key),
          onClick: () => run(key, () => updates.updateProviders({ only })),
        }}
      />
    );
  };

  return (row: UpdateEverythingRow, entry: UpdateEntry) =>
    entry.kind === "app" ? appEntry(row, entry.label) : providerEntry(row, entry.label);
}
