import { Linking, Platform, View } from "react-native";
import { Image } from "expo-image";
import { useFonts } from "expo-font";
import { AppText as Text } from "../../components/ui/AppText";
import { ListRow } from "../../components/ui/ListRow";
import { resolveNexiConfig } from "./t3team-nexiConfig";
import { useNexiHosts } from "./t3team-useNexiHosts";

export function NexiHostsSection() {
  const config = resolveNexiConfig();
  const [fontLoaded] = useFonts(
    config ? { NexiDisplay: require("../../../assets/t3team-buenos-aires-vf.ttf") } : {},
  );
  const state = useNexiHosts();
  if (Platform.OS !== "android" || !config) return null;
  return (
    <View className="gap-2">
      <Image
        source={require("../../../assets/t3team-nexi-wordmark.svg")}
        style={{ width: 120, height: 36, marginLeft: 16 }}
        contentFit="contain"
        accessibilityLabel="Nexi"
      />
      <Text
        className="px-4 text-lg text-foreground"
        style={fontLoaded ? { fontFamily: "NexiDisplay" } : undefined}
      >
        Nexi Work desktops
      </Text>
      {!state.enabled ? (
        <Text className="px-4 text-sm text-foreground-muted">
          Pair an environment first, then enable Nexi Work mobile broker in its Settings → Features.
        </Text>
      ) : (
        <>
          <ListRow label="Sign in to Nexplore" disabled={state.busy} onPress={state.signIn} />
          {state.code ? (
            <>
              <Text selectable accessibilityLiveRegion="polite" className="px-4 text-xl">
                {state.code.user_code}
              </Text>
              <ListRow
                label="Open Microsoft sign-in"
                description={state.code.verification_uri}
                onPress={() => {
                  void Linking.openURL(state.code!.verification_uri).catch(() =>
                    state.setError("Could not open the browser."),
                  );
                }}
              />
              <ListRow label="Cancel sign-in" onPress={state.cancel} />
            </>
          ) : null}
          <ListRow
            label={state.busy ? "Connecting…" : "Refresh desktops"}
            disabled={state.busy}
            onPress={state.refresh}
          />
          {state.hosts.map((host) => (
            <ListRow
              key={host.id}
              label={host.label}
              description={host.online ? "Online" : "Offline"}
              disabled={state.busy || !host.online}
              onPress={() => state.connect(host)}
            />
          ))}
          {!state.busy && state.hosts.length === 0 ? (
            <Text className="px-4 text-sm text-foreground-muted">
              Sign in or refresh to find your enrolled desktops. Hosts must be enrolled and broker
              host support enabled.
            </Text>
          ) : null}
          <ListRow label="Sign out of Nexplore" disabled={state.busy} onPress={state.signOut} />
        </>
      )}
      {state.error ? (
        <Text accessibilityLiveRegion="polite" className="px-4 text-sm text-danger-foreground">
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}
