import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NexiWordmark } from "../../components/t3team-NexiBrand";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { NexiSignInPanel } from "./t3team-NexiSignInPanel";
import { useNexiHosts } from "./t3team-useNexiHosts";

const stayOnHome = () => {};

/**
 * First-run for Nexi Work: one brand mark, one line of purpose, Entra sign-in.
 * The header brand is hidden here so the wordmark is not doubled.
 */
export function NexiWelcome(props: { readonly onOtherWays: () => void }) {
  const state = useNexiHosts({ onConnected: stayOnHome });
  const insets = useSafeAreaInsets();
  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: false }} />
      <ScrollView
        className="flex-1 bg-screen"
        contentContainerClassName="grow justify-center px-6 py-8"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[430px] gap-6 self-center">
          <View className="items-center gap-3">
            <NexiWordmark height={40} />
            <Text textRole="body" className="text-center leading-normal text-foreground-muted">
              Your Nexplore workspaces, from your phone.
            </Text>
          </View>
          <NexiSignInPanel state={state} signInLabel="Sign in" />
          <Button tone="text" fullWidth label="Other ways to connect" onPress={props.onOtherWays} />
        </View>
      </ScrollView>
    </>
  );
}
