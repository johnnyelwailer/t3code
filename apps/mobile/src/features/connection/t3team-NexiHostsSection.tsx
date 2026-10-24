import { Platform, View } from "react-native";
import { NexiWordmark, useNexiDisplayFont } from "../../components/t3team-NexiBrand";
import { AppText as Text } from "../../components/ui/AppText";
import { resolveNexiConfig } from "./t3team-nexiConfig";
import { NexiSignInPanel } from "./t3team-NexiSignInPanel";
import { useNexiHosts } from "./t3team-useNexiHosts";

function showsNexiHosts() {
  return Platform.OS === "android" && resolveNexiConfig() !== null;
}

export function NexiHostsSection() {
  const displayFont = useNexiDisplayFont();
  const state = useNexiHosts();
  if (!showsNexiHosts()) return null;
  return (
    <View className="gap-3">
      <View className="gap-2 px-4">
        <NexiWordmark height={28} />
        <Text className="text-lg text-foreground" style={displayFont}>
          Nexi Work desktops
        </Text>
      </View>
      <NexiSignInPanel state={state} />
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
