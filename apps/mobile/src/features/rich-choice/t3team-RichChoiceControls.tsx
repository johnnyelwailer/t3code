import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { cn } from "../../lib/cn";
import { describeRichChoicePosition } from "@t3tools/shared/t3team-richChoiceLogic";
import type { RichChoicePayloadOption } from "@t3tools/shared/t3team-richChoicePayload";

function Step(props: {
  readonly label: string;
  readonly symbol: "chevron.left" | "chevron.right";
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "size-11 items-center justify-center rounded-full border border-border active:opacity-70",
        props.disabled && "opacity-40",
      )}
    >
      <SymbolView name={props.symbol} size={18} tintColorClassName="accent-foreground" />
    </Pressable>
  );
}

/**
 * Previous / dots / next: a touch route to every card besides swiping. Previous and next are 44pt
 * targets; with many options the dots share the remaining width, so they are an indicator with a
 * secondary tap, and the arrows stay the primary way to step.
 */
export function T3TeamRichChoiceControls(props: {
  readonly options: ReadonlyArray<RichChoicePayloadOption>;
  readonly frontIndex: number;
  readonly onGoTo: (index: number) => void;
}) {
  const { options, frontIndex } = props;
  const count = options.length;
  return (
    <View className="flex-row items-center justify-center gap-3">
      <Step
        label="Previous"
        symbol="chevron.left"
        disabled={frontIndex === 0}
        onPress={() => props.onGoTo(frontIndex - 1)}
      />
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Choices"
        className="flex-1 flex-row items-center justify-center"
      >
        {options.map((option, position) => (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityLabel={describeRichChoicePosition(position, count, option.title)}
            accessibilityState={{ selected: position === frontIndex }}
            onPress={() => props.onGoTo(position)}
            className="h-11 max-w-11 flex-1 items-center justify-center"
          >
            <View
              className={cn(
                "h-2 rounded-full",
                position === frontIndex ? "w-6 bg-primary" : "w-2 bg-foreground-muted/40",
              )}
            />
          </Pressable>
        ))}
      </View>
      <Step
        label="Next"
        symbol="chevron.right"
        disabled={frontIndex === count - 1}
        onPress={() => props.onGoTo(frontIndex + 1)}
      />
    </View>
  );
}
