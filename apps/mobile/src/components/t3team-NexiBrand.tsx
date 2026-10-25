import { useFonts } from "expo-font";
import { Image } from "expo-image";
import { View, type TextStyle } from "react-native";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AppText as Text } from "./ui/AppText";

const WORDMARK_ASPECT = 59.334 / 21.029;
const NEXI_DISPLAY_FONT = { NexiDisplay: require("../../assets/t3team-buenos-aires-vf.ttf") };

/** The pack display face, once loaded; text falls back to the app font until then. */
export function useNexiDisplayFont(): TextStyle | undefined {
  const [loaded] = useFonts(NEXI_DISPLAY_FONT);
  return loaded ? { fontFamily: "NexiDisplay" } : undefined;
}

export function NexiWordmark(props: { readonly height: number }) {
  const { themeVariables } = useAppearancePreferences();
  return (
    <Image
      source={require("../../assets/t3team-nexi-wordmark.svg")}
      style={{ height: props.height, width: props.height * WORDMARK_ASPECT }}
      contentFit="contain"
      tintColor={themeVariables["--color-foreground"]}
      accessibilityLabel="Nexi"
    />
  );
}

/** Header title for the Nexi Work distribution, in place of the T3 Code wordmark. */
export function NexiBrandTitle(props: {
  readonly scale: number;
  readonly accessibilityLabel?: string;
  readonly allowFontScaling?: boolean;
}) {
  const displayFont = useNexiDisplayFont();
  return (
    <View
      aria-level={1}
      accessibilityLabel={
        props.accessibilityLabel?.replace(/^T3 Code/, "Nexi Work") ?? "Nexi Work, Threads"
      }
      accessible
      role="heading"
      className="flex-row items-center"
      style={{ gap: 6 * props.scale }}
    >
      <NexiWordmark height={Math.round(20 * props.scale)} />
      <Text
        allowFontScaling={props.allowFontScaling}
        className="font-t3-medium text-foreground-muted"
        style={[{ fontSize: 21 * props.scale, letterSpacing: -0.5 * props.scale }, displayFont]}
      >
        Work
      </Text>
    </View>
  );
}
