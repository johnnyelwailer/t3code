import type { DesktopRouteCard } from "@t3tools/contracts";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";

/**
 * The same card as the web one, from the same `desktopRouteCardFrom`: which cloud session, the host
 * in monospace with a warning for an internal address, the agent's reason as plain text, and
 * Approve once / Approve for this session / Deny, with Always only as a quiet extra on a public host.
 */
export function T3TeamDesktopRouteCard(props: {
  readonly card: DesktopRouteCard;
  readonly sessionLabel: string;
  readonly disabled: boolean;
  readonly onAnswer: (label: string) => void;
}) {
  const { card, sessionLabel, disabled, onAnswer } = props;
  const { once, session, always, decline } = card.actions;
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
      <Text className="font-t3-bold text-base text-foreground">Route through your computer?</Text>
      {row(
        "Cloud session",
        <Text className="font-sans text-sm text-foreground">{sessionLabel}</Text>,
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
          {card.internal ? (
            <Text className="rounded-md bg-warning/15 px-2 py-1 font-t3-bold text-xs text-warning">
              Internal address
            </Text>
          ) : null}
        </View>,
      )}
      {row(
        "Why",
        <Text className="font-sans text-sm leading-5 text-foreground">
          {card.reason === "" ? "The agent gave no reason." : card.reason}
        </Text>,
      )}
      {card.internal ? (
        <Text className="font-sans text-xs text-foreground-muted">
          It may resolve to a private network address on your network.
        </Text>
      ) : null}
      <Text className="font-sans text-xs text-foreground-muted">
        Your computer applies this, only for this host and only while it is online.
      </Text>
      <View className="gap-2">
        {once === null ? null : (
          <Button
            label="Approve once"
            fullWidth
            tone="primary"
            disabled={disabled}
            onPress={() => onAnswer(once)}
          />
        )}
        {session === null ? null : (
          <Button
            label="Approve for this session"
            fullWidth
            disabled={disabled}
            onPress={() => onAnswer(session)}
          />
        )}
        {decline === null ? null : (
          <Button
            label="Deny"
            fullWidth
            tone="text"
            disabled={disabled}
            onPress={() => onAnswer(decline)}
          />
        )}
        {always === null ? null : (
          <Button
            label="Always for this host"
            fullWidth
            tone="text"
            disabled={disabled}
            onPress={() => onAnswer(always)}
          />
        )}
      </View>
    </View>
  );
}
