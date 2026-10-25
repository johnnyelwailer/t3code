import { Pressable, useWindowDimensions, View } from "react-native";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { ConnectionStatusDot } from "./ConnectionStatusDot";
import type { NexiHostRow as Row } from "./t3team-nexiStartModel";

const DOT = { online: "connected", offline: "available", unknown: "unsupported" } as const;

/** One enrolled desktop. Long names truncate (two lines once text is scaled up); the whole row taps. */
export function NexiHostRow(props: { readonly row: Row; readonly onPress: (id: string) => void }) {
  const { row } = props;
  const { fontScale } = useWindowDimensions();
  const lines = fontScale >= 1.5 ? 2 : 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.status}`}
      accessibilityHint={row.disabled ? undefined : "Connects to this desktop"}
      accessibilityState={{ disabled: row.disabled, busy: row.connecting }}
      disabled={row.disabled}
      onPress={() => props.onPress(row.id)}
      android_ripple={{ color: "rgba(127,127,127,0.18)" }}
      className="min-h-16 flex-row items-center gap-3 bg-grouped-card px-4 py-3"
    >
      <ConnectionStatusDot
        state={row.connecting ? "connecting" : DOT[row.presence]}
        pulse={row.connecting}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          textRole="body"
          numberOfLines={lines}
          className={row.disabled && !row.connecting ? "text-foreground-muted" : "text-foreground"}
        >
          {row.title}
        </Text>
        <Text textRole="footnote" numberOfLines={lines} className="text-foreground-muted">
          {row.status}
        </Text>
      </View>
      {row.connecting ? (
        <AppActivityIndicator colorClassName="accent-foreground-muted" />
      ) : row.disabled ? null : (
        <SymbolView
          name="chevron.right"
          size={16}
          tintColorClassName="accent-chevron"
          type="monochrome"
          weight="semibold"
        />
      )}
    </Pressable>
  );
}
