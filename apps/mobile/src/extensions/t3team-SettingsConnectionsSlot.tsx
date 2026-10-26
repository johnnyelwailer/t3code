import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";

/** The distribution's `settingsConnections` row, isolated from the stock settings; nothing without one. */
export function SettingsConnectionsSlot() {
  const Row = mobileExtensions.settingsConnections;
  return Row ? (
    <ExtensionBoundary>
      <Row />
    </ExtensionBoundary>
  ) : null;
}
