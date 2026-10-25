import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NexiStartPanel } from "./t3team-NexiStartPanel";
import { useNexiStart } from "./t3team-useNexiStart";

const stayOnHome = () => {};

/**
 * First run on Android Nexi Work. The header already carries the brand, so the body holds only
 * the actions that fit the current state (sign in, enrol a desktop, pick one, recover).
 */
export function NexiWelcome(props: { readonly onOtherWays: () => void }) {
  const start = useNexiStart({ onPair: props.onOtherWays, onConnected: stayOnHome });
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-screen"
      contentContainerClassName="grow px-6 pt-8"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-[430px] self-center">
        <NexiStartPanel {...start} />
      </View>
    </ScrollView>
  );
}
