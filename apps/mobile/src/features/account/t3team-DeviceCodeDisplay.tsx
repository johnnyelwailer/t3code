import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";

/** The sign-in code, large and selectable, with the page to enter it at. */
export function DeviceCodeDisplay(props: { readonly code: string; readonly uri: string | null }) {
  return (
    <View className="items-center gap-2 rounded-[24px] bg-grouped-card px-6 py-6">
      <Text className="text-sm text-foreground-muted">Your sign-in code</Text>
      <Text selectable className="text-center text-4xl font-t3-bold tracking-widest">
        {props.code}
      </Text>
      {props.uri === null ? null : (
        <Text selectable className="text-center text-base text-foreground-muted">
          {props.uri}
        </Text>
      )}
    </View>
  );
}
