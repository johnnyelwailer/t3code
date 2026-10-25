import * as Clipboard from "expo-clipboard";
import { Linking, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import type { NexiDeviceCode } from "./t3team-nexiOAuth";

/** The Microsoft device-code step: the code is copied, then the browser opens on the sign-in page. */
export function NexiDeviceCodeCard(props: {
  readonly code: NexiDeviceCode;
  readonly onCancel: () => void;
  readonly onError: (message: string) => void;
}) {
  const open = () =>
    void Clipboard.setStringAsync(props.code.user_code)
      .then(() => Linking.openURL(props.code.verification_uri))
      .catch(() => props.onError("Could not open the browser."));
  return (
    <View className="gap-3 rounded-[22px] bg-grouped-card p-4">
      <Text className="text-sm text-foreground-muted">
        Enter this code on the Microsoft page. It is copied for you.
      </Text>
      <Text
        selectable
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Sign-in code ${props.code.user_code.split("").join(" ")}`}
        className="font-mono text-2xl tracking-[2px] text-foreground"
      >
        {props.code.user_code}
      </Text>
      <Button
        tone="primary"
        fullWidth
        icon="arrow.up.right"
        label="Open Microsoft sign-in"
        onPress={open}
      />
      <Button tone="text" fullWidth label="Cancel" onPress={props.onCancel} />
    </View>
  );
}
