/**
 * Mobile twin of the web credential-source picker. A phone has no `gh` sign-in or environment of its
 * own, so it reads from another machine the user has connected (their desktop), never from the machine
 * running the session. The probe describes sources without a value; the read is the one call that
 * returns it, made only after the user taps Use, and the value goes straight to the card's own answer.
 */
import { credentialRequestIntro } from "@t3tools/client-runtime/t3team-credentialSourceOptions";
import type { EnvironmentId } from "@t3tools/contracts";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import {
  useT3TeamCredentialSources,
  type CredentialRequestSource,
} from "./t3team-useCredentialSources";

export function T3TeamCredentialSourcesPicker(props: {
  /** The session's own environment: never a source, it is where the value is going. */
  readonly sessionEnvironmentId: EnvironmentId;
  readonly source: CredentialRequestSource;
  readonly busy: boolean;
  /** True while a source is being checked or read, so the card can hold its own actions. */
  readonly onReadingChange: (reading: boolean) => void;
  /** The chosen source's value, handed to the card's own answer. */
  readonly onValue: (value: string) => void;
}) {
  const { machines, checked, error, reading, probe, use } = useT3TeamCredentialSources(props);
  const intro = credentialRequestIntro(props.source);
  const disabled = props.busy || reading;
  return (
    <View className="gap-2">
      {intro === "" ? null : (
        <Text className="font-sans text-sm leading-5 text-foreground-muted">{intro}</Text>
      )}
      {checked === null ? (
        machines.length === 0 ? (
          <Text className="font-sans text-xs text-foreground-muted">
            No other machine is connected. Enter the value below.
          </Text>
        ) : (
          machines.map((machine) => (
            <Button
              key={machine.environmentId}
              label={`Use something from ${machine.label}`}
              tone="secondary"
              fullWidth
              disabled={disabled}
              onPress={() => void probe(machine.environmentId)}
            />
          ))
        )
      ) : checked.options.length === 0 ? (
        <Text className="font-sans text-xs text-foreground-muted">
          Nothing for this request on that machine. Enter the value below.
        </Text>
      ) : (
        checked.options.map((option) => (
          <View key={option.id} className="gap-1">
            <Text className="font-sans text-sm text-foreground">{option.label}</Text>
            {option.detail === undefined ? null : (
              <Text className="font-sans text-xs text-foreground-muted">{option.detail}</Text>
            )}
            {option.hint === undefined ? null : (
              <Text className="font-sans text-xs text-foreground-muted" selectable>
                This sign-in lacks a requested scope. To add it, run {option.hint}, then ask again.
              </Text>
            )}
            {option.warning === undefined ? null : (
              <Text className="font-sans text-xs text-warning-foreground">{option.warning}</Text>
            )}
            <Button
              label="Use"
              accessibilityLabel={`Use ${option.label}`}
              tone="secondary"
              disabled={disabled || option.disabled}
              onPress={() => void use(checked.environmentId, option.id)}
            />
          </View>
        ))
      )}
      {error === null ? null : (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="font-sans text-xs text-danger-foreground"
        >
          {error}
        </Text>
      )}
    </View>
  );
}
