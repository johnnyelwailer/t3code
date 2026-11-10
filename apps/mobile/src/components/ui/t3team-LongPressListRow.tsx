import { Platform } from "react-native";

import { useResolveClassNames } from "uniwind";
import { SymbolView } from "./AppSymbol";
import { ListRowLayout, type ListRowContentProps } from "./ListRowLayout";
import { RowPressable } from "./RowPressable";

/**
 * `ListRow` with an optional long press. ListRow's own pressable takes the touch, so a
 * long press on a wrapper around it never fires; this row puts it on that pressable.
 */
export function LongPressListRow(
  props: ListRowContentProps & {
    readonly onPress: () => void;
    readonly onLongPress?: (() => void) | undefined;
    readonly accessibilityHint?: string | undefined;
  },
) {
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={[props.label, props.description, props.detail].filter(Boolean).join(", ")}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      android_ripple={{ color: rippleStyle.backgroundColor }}
      unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
      className="bg-grouped-card"
    >
      <ListRowLayout
        {...props}
        accessory={
          <SymbolView
            name="chevron.right"
            size={16}
            tintColorClassName="accent-chevron"
            type="monochrome"
            weight="semibold"
          />
        }
      />
    </RowPressable>
  );
}
