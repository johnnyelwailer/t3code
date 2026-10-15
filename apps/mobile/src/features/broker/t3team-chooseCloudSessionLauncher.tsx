import type { EnvironmentId } from "@t3tools/contracts";
import { Alert } from "react-native";

import type { CloudSessionLauncher } from "./t3team-cloudSessionLaunchers";

/** The "Start cloud sessions through …" chooser, shared by the Machines screen and the Environments header. */
export function chooseCloudSessionLauncher(
  launchers: ReadonlyArray<CloudSessionLauncher>,
  onChoose: (environmentId: EnvironmentId) => void,
) {
  Alert.alert("Start cloud sessions through", undefined, [
    ...launchers.map((launcher) => ({
      text: launcher.label,
      onPress: () => onChoose(launcher.environmentId),
    })),
    { text: "Close", style: "cancel" as const },
  ]);
}
