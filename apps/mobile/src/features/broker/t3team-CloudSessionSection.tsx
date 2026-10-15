import { cloudSessionDisplayName } from "@t3tools/client-runtime/state/cloud-sessions";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { Alert } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ListRow } from "../../components/ListRow";
import { SettingsActionRow } from "../settings/components/SettingsActionRow";
import { SettingsSection } from "../settings/components/SettingsSection";
import {
  type CloudSessionAction,
  cloudSessionActions,
  cloudSessionRowDetail,
} from "./t3team-cloudSessionActions";
import type { CloudSessionLauncher } from "./t3team-cloudSessionLaunchers";
import { useCloudSessionList } from "./t3team-useCloudSessionList";
import type { BrokerDeviceToOpen } from "./t3team-useOpenBrokerDevice";

function offerActions(
  session: CloudSession,
  onAction: (action: CloudSessionAction, session: CloudSession) => void,
) {
  const choices = cloudSessionActions(session);
  if (choices.length === 0) return;
  Alert.alert(cloudSessionDisplayName(session), cloudSessionRowDetail(session), [
    ...choices.map((choice) => ({
      text: choice.label,
      style: choice.destructive ? ("destructive" as const) : ("default" as const),
      onPress: () => onAction(choice.action, session),
    })),
    { text: "Close", style: "cancel" as const },
  ]);
}

function chooseLauncher(
  launchers: ReadonlyArray<CloudSessionLauncher>,
  onChoose: (environmentId: EnvironmentId) => void,
) {
  Alert.alert("Start cloud sessions through", undefined, [
    ...launchers.map((launcher) => ({
      text: launcher.label,
      onPress: () => onChoose(launcher.environmentId),
    })),
    { text: "Close", style: "cancel" as const },
  ]);
}

/**
 * Cloud sessions started through one of the user's connected machines: start one, follow its
 * phases, cancel or stop it. The machine holds the GHE sign-in and asks the broker for each grant.
 */
export function CloudSessionSection(props: {
  readonly launcher: CloudSessionLauncher;
  readonly launchers: ReadonlyArray<CloudSessionLauncher>;
  readonly onChooseLauncher: (environmentId: EnvironmentId) => void;
  readonly onOpen: (device: BrokerDeviceToOpen) => void;
}) {
  const { launcher, launchers } = props;
  const { list, pending, failure, start, cancel } = useCloudSessionList(launcher.environmentId);
  const onAction = (action: CloudSessionAction, session: CloudSession) => {
    if (action === "open") {
      props.onOpen({ key: session.sessionId, label: cloudSessionDisplayName(session) });
    } else void (action === "cancel" ? cancel(session.sessionId) : start());
  };
  const footer =
    failure ??
    list.loadError ??
    (list.configured
      ? `Started through ${launcher.label}.`
      : `Set up cloud sessions in Nexi Work on ${launcher.label} first.`);

  return (
    <SettingsSection title="Cloud sessions" footer={footer}>
      {launchers.length > 1 ? (
        <ListRow
          icon="desktopcomputer"
          label="Start through"
          detail={launcher.label}
          onPress={() => chooseLauncher(launchers, props.onChooseLauncher)}
        />
      ) : null}
      <SettingsActionRow
        icon="plus"
        label="New cloud session"
        loading={pending === "create"}
        disabled={pending !== null || !list.configured}
        onPress={() => void start()}
      />
      {list.sessions.map((session) => (
        <ListRow
          key={session.sessionId}
          icon="cloud"
          label={cloudSessionDisplayName(session)}
          description={cloudSessionRowDetail(session)}
          disabled={pending === session.sessionId}
          onPress={() => offerActions(session, onAction)}
        />
      ))}
    </SettingsSection>
  );
}

export function NoCloudSessionLauncher() {
  return (
    <Text className="px-2 text-sm text-foreground-muted">
      Connect Nexi Work on your desktop to start cloud sessions from here.
    </Text>
  );
}
