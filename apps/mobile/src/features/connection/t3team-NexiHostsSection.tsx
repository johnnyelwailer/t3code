import { Platform, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { resolveNexiConfig } from "./t3team-nexiConfig";
import { NexiStartPanel } from "./t3team-NexiStartPanel";
import { useNexiStart } from "./t3team-useNexiStart";

function showsNexiHosts() {
  return Platform.OS === "android" && resolveNexiConfig() !== null;
}

/** The same start panel on Add environment, minus the pairing action the screen already shows. */
export function NexiHostsSection() {
  const start = useNexiStart({});
  if (!showsNexiHosts()) return null;
  return (
    <View className="px-4">
      <NexiStartPanel {...start} hidePair />
    </View>
  );
}

/** Separates the Nexi sign-in above from the stock pairing and relay options below. */
export function NexiOtherWaysHeading() {
  if (!showsNexiHosts()) return null;
  return (
    <Text className="px-4 text-sm font-t3-medium text-foreground-muted">Other ways to connect</Text>
  );
}
