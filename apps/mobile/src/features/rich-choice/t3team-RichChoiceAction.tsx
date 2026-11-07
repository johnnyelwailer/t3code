import { Pressable } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";

/** The front card's explicit action: choose, or toggle a pick in a multiple choice. */
export function T3TeamRichChoiceAction(props: {
  readonly label: string;
  readonly multiple: boolean;
  readonly picked: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const added = props.multiple && props.picked;
  const label = added ? "Added" : props.label;
  return (
    <Pressable
      accessibilityRole={props.multiple ? "togglebutton" : "button"}
      accessibilityLabel={label}
      accessibilityHint={added ? "Double tap to remove this pick" : undefined}
      accessibilityState={{ disabled: props.disabled, selected: props.picked }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "min-h-12 w-full items-center justify-center rounded-full px-6 active:opacity-70",
        props.disabled ? "bg-subtle-strong" : added ? "border border-primary" : "bg-primary",
      )}
    >
      <Text
        className={cn(
          "text-center font-t3-medium",
          props.disabled
            ? "text-foreground-muted"
            : added
              ? "text-primary-text"
              : "text-primary-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
