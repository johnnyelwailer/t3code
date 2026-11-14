import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import type { DesktopUpdateButtonAction } from "../desktopUpdate.logic";
import type { ServerUpdateTarget } from "../ServerUpdateAction";
import { UpdateEntryChip } from "./t3team-UpdateEntryChip";
import { appRestartScope } from "./t3team-nexiUpdateNotice.logic";
import { ProviderUpdateEntries, ServerUpdateEntry } from "./t3team-UpdateRowEntries";
import type { UpdateEntryCell } from "./t3team-updateEntryCell";
import type { UpdateEverythingRow } from "./updateEverything.logic";

const APP_ACTIONS = {
  download: { label: "Download this app's update", icon: "download" },
  install: { label: "Restart this app to update", icon: "restart" },
} as const;

/** Update-dialog entries that update on their own: this app, one server, or one provider. */
export function useUpdateRowActions(
  rows: ReadonlyArray<UpdateEverythingRow>,
  servers: ReadonlyArray<ServerUpdateTarget>,
  action: DesktopUpdateButtonAction,
  onUpdateApp: () => void,
) {
  const enabled = useFeatureFlag("UI_UPDATE_BADGE_ROW_ACTIONS");
  if (!enabled) return null;
  const appScope = appRestartScope(rows);

  const appEntry = (row: UpdateEverythingRow, label: string) => {
    if (row.app === "this-app") {
      if (action === "none" || row !== appScope.actionRow) return null;
      const { label: actionLabel, icon } = APP_ACTIONS[action];
      return (
        <UpdateEntryChip
          label={label}
          action={{
            label: actionLabel,
            icon,
            restartEnvironmentIds: action === "install" ? appScope.environmentIds : [],
            pending: false,
            onClick: onUpdateApp,
          }}
        />
      );
    }
    const server = servers.find((target) => target.environmentId === row.environmentId);
    if (server === undefined) return null;
    return <ServerUpdateEntry label={label} machineLabel={row.label} server={server} />;
  };

  return (row: UpdateEverythingRow, cell: UpdateEntryCell) =>
    cell.kind === "app" ? (
      appEntry(row, cell.label)
    ) : (
      <ProviderUpdateEntries
        environmentId={row.environmentId}
        machineLabel={row.label}
        providers={row.providers}
      />
    );
}
