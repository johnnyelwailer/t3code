/** The "add access" action on a gh sign-in that lacks a scope: the button, then the code and page to approve it on. */
import { addAccessLabel } from "@t3tools/client-runtime/t3team-credentialSourceOptions";
import { Linking, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import type { CredentialRefreshView } from "./t3team-useCredentialRefresh";

export function T3TeamCredentialAddAccess(props: {
  readonly view: CredentialRefreshView;
  readonly host: string;
  readonly scopes: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onStart: (host: string, scopes: ReadonlyArray<string>) => void;
}) {
  const { view } = props;
  return (
    <View className="gap-1">
      {view.phase === "waiting" ? (
        <>
          <Text className="font-sans text-xs text-foreground-muted">
            Open the page, enter this code and approve. This card updates when you have.
          </Text>
          <Text className="font-mono text-lg tracking-widest text-foreground" selectable>
            {view.userCode}
          </Text>
          <Button
            label="Open the sign-in page"
            tone="secondary"
            onPress={() => void Linking.openURL(view.verificationUri).catch(() => undefined)}
          />
        </>
      ) : (
        <Button
          label={addAccessLabel(props.scopes)}
          tone="secondary"
          disabled={props.disabled || view.phase === "starting"}
          onPress={() => props.onStart(props.host, props.scopes)}
        />
      )}
      {view.phase === "failed" ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="font-sans text-xs text-danger-foreground"
        >
          {view.message}
        </Text>
      ) : null}
    </View>
  );
}
