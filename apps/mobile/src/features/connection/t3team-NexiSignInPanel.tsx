import * as Clipboard from "expo-clipboard";
import { Linking, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ListRow } from "../../components/ui/ListRow";
import type { useNexiHosts } from "./t3team-useNexiHosts";
import type { NexiDeviceCode } from "./t3team-nexiOAuth";

type NexiHostsState = ReturnType<typeof useNexiHosts>;

function openMicrosoftSignIn(state: NexiHostsState, code: NexiDeviceCode) {
  void Clipboard.setStringAsync(code.user_code)
    .then(() => Linking.openURL(code.verification_uri))
    .catch(() => state.setError("Could not open the browser."));
}

function DeviceCodeCard(props: { readonly state: NexiHostsState; readonly code: NexiDeviceCode }) {
  return (
    <View className="gap-3 rounded-[22px] bg-grouped-card p-4">
      <Text className="text-sm text-foreground-muted">
        Enter this code on the Microsoft page. It is copied for you.
      </Text>
      <Text
        selectable
        accessibilityLiveRegion="polite"
        className="font-mono text-2xl tracking-[2px] text-foreground"
      >
        {props.code.user_code}
      </Text>
      <Button
        tone="primary"
        fullWidth
        icon="arrow.up.right"
        label="Open Microsoft sign-in"
        onPress={() => openMicrosoftSignIn(props.state, props.code)}
      />
      <Button tone="text" fullWidth label="Cancel" onPress={props.state.cancel} />
    </View>
  );
}

function HostList(props: { readonly state: NexiHostsState }) {
  const { state } = props;
  return (
    <View className="overflow-hidden rounded-[22px]">
      {state.hosts.map((host) => (
        <ListRow
          key={host.id}
          label={host.label}
          description={host.online ? "Online" : "Offline"}
          disabled={state.busy || !host.online}
          onPress={() => state.connect(host)}
        />
      ))}
      <ListRow
        label={state.busy ? "Connecting…" : "Refresh desktops"}
        disabled={state.busy}
        onPress={state.refresh}
      />
      <ListRow label="Sign out of Nexplore" disabled={state.busy} onPress={state.signOut} />
    </View>
  );
}

/** Entra sign-in and the signed-in user's desktops; shared by first run and Add environment. */
export function NexiSignInPanel(props: {
  readonly state: NexiHostsState;
  /** Defaults to the Microsoft-named label used on Add environment. */
  readonly signInLabel?: string;
}) {
  const { state } = props;
  if (!state.enabled) {
    return (
      <Text className="text-sm text-foreground-muted">
        Pair an environment first, then enable Nexi Work mobile broker in its Settings → Features.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      {state.code ? (
        <DeviceCodeCard state={state} code={state.code} />
      ) : state.signedIn ? (
        <HostList state={state} />
      ) : (
        <Button
          tone="primary"
          fullWidth
          icon="person.crop.circle"
          label={props.signInLabel ?? "Sign in with Microsoft"}
          loading={state.busy}
          onPress={state.signIn}
        />
      )}
      {state.signedIn && !state.busy && state.hosts.length === 0 ? (
        <Text className="text-sm text-foreground-muted">
          No desktops yet. Enrol Nexi Work on your desktop, then refresh.
        </Text>
      ) : null}
      {state.error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger-foreground">
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}
