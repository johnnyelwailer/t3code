import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NexiMark, NexiWordmark, useNexiDisplayFont } from "../../components/t3team-NexiBrand";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { NexiSignInPanel } from "./t3team-NexiSignInPanel";
import { useNexiHosts } from "./t3team-useNexiHosts";

const stayOnHome = () => {};

export function NexiWelcome(props: { readonly onOtherWays: () => void }) {
  const state = useNexiHosts({ onConnected: stayOnHome });
  const displayFont = useNexiDisplayFont();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-screen"
      contentContainerClassName="grow justify-center px-6 py-8"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-[430px] gap-6 self-center">
        <View className="items-center gap-4">
          <NexiMark size={72} />
          <NexiWordmark height={34} />
          <Text
            textRole="title"
            className="text-center font-t3-bold text-foreground"
            style={displayFont}
          >
            Welcome to Nexi Work
          </Text>
          <Text textRole="body" className="text-center leading-normal text-foreground-muted">
            Sign in with your Nexplore account to reach the desktops you enrolled.
          </Text>
        </View>
        <NexiSignInPanel state={state} />
        <View className="items-center">
          <Button tone="text" label="Other ways to connect" onPress={props.onOtherWays} />
        </View>
      </View>
    </ScrollView>
  );
}
