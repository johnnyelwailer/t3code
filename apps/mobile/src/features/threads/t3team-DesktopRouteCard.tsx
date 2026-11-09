import { desktopRouteChoices, type DesktopRouteCard } from "@t3tools/contracts";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";

/**
 * The same card as the web one, from the same `desktopRouteCardFrom` and `desktopRouteChoices`:
 * which cloud session, the host in monospace with a warning for an internal address, the agent's
 * reason as plain text, then Approve (once), the wider scopes as quiet extras, and Deny. On a thread
 * that is not a cloud session there is nothing to route: it says so and offers only Dismiss.
 */
export function T3TeamDesktopRouteCard(props: {
  readonly card: DesktopRouteCard;
  /** The cloud session's name, or null when the thread is not in a cloud session. */
  readonly sessionLabel: string | null;
  readonly disabled: boolean;
  readonly onAnswer: (label: string) => void;
}) {
  const { card, sessionLabel, disabled, onAnswer } = props;
  const local = sessionLabel === null;
  const { primary, more, decline } = desktopRouteChoices(card);
  // A phone cannot approve an internal address yet: the desktop refuses it, so it is not offered.
  const approvals = local || card.internal ? [] : [primary, ...more].filter((c) => c !== null);
  const row = (name: string, children: React.ReactNode) => (
    <View className="gap-0.5">
      <Text className="font-t3-bold text-2xs uppercase tracking-[1px] text-foreground-muted">
        {name}
      </Text>
      {children}
    </View>
  );
  return (
    <View className="gap-3 pt-1">
      <Text className="font-t3-bold text-base text-foreground">
        {local ? "Nothing to route" : "Route this host through your computer?"}
      </Text>
      {local ? (
        <Text className="font-sans text-sm leading-5 text-foreground">
          This thread is not in a cloud session, so routing through your computer would change
          nothing. If the host can't be reached, check the address, your VPN or DNS.
        </Text>
      ) : (
        row(
          "Cloud session",
          <Text className="font-sans text-sm text-foreground">{sessionLabel}</Text>,
        )
      )}
      {row(
        "Host",
        <View className="flex-row flex-wrap items-center gap-2">
          <Text
            selectable
            className="rounded-md bg-input px-2 py-1 font-mono text-sm text-foreground"
          >
            {card.target}
          </Text>
          {card.internal && !local ? (
            <Text className="rounded-md bg-warning/15 px-2 py-1 font-t3-bold text-xs text-warning">
              Internal address
            </Text>
          ) : null}
        </View>,
      )}
      {row(
        local ? "Agent said" : "Why",
        <Text className="font-sans text-sm leading-5 text-foreground">
          {card.reason === "" ? "The agent gave no reason." : card.reason}
        </Text>,
      )}
      {local ? null : card.internal ? (
        <Text className="font-sans text-xs text-foreground-muted">
          It may resolve to a private network address on your network. Internal addresses are
          approved on your computer, not from the phone.
        </Text>
      ) : (
        <Text className="font-sans text-xs text-foreground-muted">
          Your computer applies this, only for this host and only while it is online.
        </Text>
      )}
      <View className="gap-2">
        {approvals.map((choice, index) => (
          <Button
            key={choice.scope}
            label={choice.text}
            fullWidth
            {...(index === 0 ? { tone: "primary" as const } : {})}
            disabled={disabled}
            onPress={() => onAnswer(choice.label)}
          />
        ))}
        {decline === null ? null : (
          <Button
            label={local ? "Dismiss" : "Deny"}
            fullWidth
            {...(local ? {} : { tone: "text" as const })}
            disabled={disabled}
            onPress={() => onAnswer(decline)}
          />
        )}
      </View>
    </View>
  );
}
