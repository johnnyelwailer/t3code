import { useNavigation } from "@react-navigation/native";

import { resolveNexiDistributionConfig } from "../distribution/t3team-nexiDistributionConfig";
import { SettingsRow } from "../settings/components/SettingsRow";
import { SettingsSection } from "../settings/components/SettingsSection";

/** The way into "Machines" from Settings; absent in a build with no Nexi broker. */
export function MachinesRow() {
  const navigation = useNavigation();
  if (resolveNexiDistributionConfig().broker.url === null) return null;
  return (
    <SettingsSection title="Nexi">
      <SettingsRow
        icon="desktopcomputer"
        label="Machines & cloud sessions"
        onPress={() => navigation.navigate("Machines")}
      />
    </SettingsSection>
  );
}
