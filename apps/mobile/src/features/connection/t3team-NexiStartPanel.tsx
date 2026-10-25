import { View } from "react-native";
import { useNexiDisplayFont } from "../../components/t3team-NexiBrand";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { NexiDeviceCodeCard } from "./t3team-NexiDeviceCodeCard";
import { NexiHostRow } from "./t3team-NexiHostRow";
import { NexiStartSkeleton } from "./t3team-NexiStartSkeleton";
import type { NexiDeviceCode } from "./t3team-nexiOAuth";
import type { NexiStartActionId, NexiStartModel } from "./t3team-nexiStartModel";

export interface NexiStartHandlers {
  readonly onAction: (id: NexiStartActionId) => void;
  readonly onHost: (id: string) => void;
  readonly onCancelSignIn: () => void;
  readonly onError: (message: string) => void;
}

/** The start screen body for one model: what you can do now, and the one next step per state. */
export function NexiStartPanel(props: {
  readonly model: NexiStartModel;
  readonly code: NexiDeviceCode | null;
  readonly handlers: NexiStartHandlers;
  /** The host screen already offers the pairing path itself. */
  readonly hidePair?: boolean;
}) {
  const { model, handlers } = props;
  const displayFont = useNexiDisplayFont();
  if (model.mode === "loading") return <NexiStartSkeleton />;
  if (model.mode === "device-code" && props.code)
    return (
      <NexiDeviceCodeCard
        code={props.code}
        onCancel={handlers.onCancelSignIn}
        onError={handlers.onError}
      />
    );
  const listed = model.mode === "hosts";
  const offline = model.banner === "No internet connection.";
  return (
    <View className="gap-4">
      {model.title ? (
        <Text
          accessibilityRole="header"
          textRole={listed ? "footnote" : "title"}
          className={
            listed ? "px-1 font-t3-medium text-foreground-muted" : "font-t3-bold text-foreground"
          }
          style={listed ? undefined : displayFont}
        >
          {model.title}
        </Text>
      ) : null}
      {model.body ? (
        <Text textRole="body" className="leading-normal text-foreground-muted">
          {model.body}
        </Text>
      ) : null}
      {model.banner ? (
        <Notice
          message={model.banner}
          tone={offline ? "default" : "danger"}
          icon={offline ? "wifi.slash" : "exclamationmark.triangle"}
        />
      ) : null}
      {listed ? (
        <View className="overflow-hidden rounded-[22px] bg-grouped-card">
          {model.hosts.map((row, index) => (
            <View key={row.id} className={index > 0 ? "border-t border-border" : undefined}>
              <NexiHostRow row={row} onPress={handlers.onHost} />
            </View>
          ))}
        </View>
      ) : null}
      <View className="gap-2">
        {model.actions
          .filter((action) => !(props.hidePair && action.id === "pair"))
          .map((action) => (
            <Button
              key={action.id}
              tone={action.tone}
              fullWidth
              label={action.label}
              disabled={action.disabled}
              loading={action.busy}
              onPress={() => handlers.onAction(action.id)}
            />
          ))}
      </View>
    </View>
  );
}
