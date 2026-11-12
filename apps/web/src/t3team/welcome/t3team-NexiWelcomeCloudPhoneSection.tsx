import { CloudIcon, SmartphoneIcon } from "lucide-react";

import { NexiWelcomePhoneRow } from "./t3team-NexiWelcomePhoneRow";
import { SecondaryAction, ServiceMark, StatusLabel, WelcomeItem } from "./t3team-welcomeLayout";

export type NexiWelcomeCloudPhoneSectionProps = {
  readonly entraSignedIn: boolean;
  readonly skipped: boolean;
  readonly cloudOn: boolean;
  /** Cloud sessions are on, or this client may turn them on from the row. */
  readonly cloudUsable: boolean;
  readonly cloudAvailable: boolean;
  readonly cloudConfigured: boolean;
  readonly cloudPending: boolean;
  readonly cloudReady: boolean;
  readonly onTurnOnCloud: () => void;
  readonly onSetupPhone: () => void;
  readonly onSkip: () => void;
};

export function NexiWelcomeCloudPhoneSection({
  entraSignedIn,
  skipped,
  cloudOn,
  cloudUsable,
  cloudAvailable,
  cloudConfigured,
  cloudPending,
  cloudReady,
  onTurnOnCloud,
  onSetupPhone,
  onSkip,
}: NexiWelcomeCloudPhoneSectionProps) {
  const cloudMark = (
    <ServiceMark label="Cloud">
      <CloudIcon className="size-5" aria-hidden />
    </ServiceMark>
  );
  const phoneMark = (
    <ServiceMark label="Phone">
      <SmartphoneIcon className="size-5" aria-hidden />
    </ServiceMark>
  );

  if (skipped) {
    return (
      <WelcomeItem
        mark={cloudMark}
        title="Cloud sessions"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }

  if (!entraSignedIn) {
    return (
      <>
        <WelcomeItem
          mark={cloudMark}
          title="Cloud sessions"
          status={<StatusLabel status="locked" label="Needs sign-in" />}
        />
        <WelcomeItem
          mark={phoneMark}
          title="Phone"
          status={<StatusLabel status="locked" label="Needs sign-in" />}
        />
      </>
    );
  }

  const cloudRow = cloudReady ? (
    <WelcomeItem
      mark={cloudMark}
      title="Cloud sessions"
      status={<StatusLabel status="ready" label="Ready" />}
    />
  ) : cloudPending ? (
    <WelcomeItem
      mark={cloudMark}
      title="Cloud sessions"
      status={<StatusLabel status="pending" label="Setting up" />}
    />
  ) : !cloudUsable ? (
    <WelcomeItem
      mark={cloudMark}
      title="Cloud sessions"
      description="Cloud sessions are turned off on this computer."
      status={<StatusLabel status="locked" label="Unavailable" />}
    />
  ) : cloudOn && (!cloudAvailable || !cloudConfigured) ? (
    <WelcomeItem
      mark={cloudMark}
      title="Cloud sessions"
      description={
        !cloudConfigured
          ? "Cloud sessions need the GitHub CLI signed in on this computer."
          : "Cloud sessions are not available on this connection."
      }
      status={<StatusLabel status="locked" label="Unavailable" />}
    />
  ) : (
    <WelcomeItem
      mark={cloudMark}
      title="Cloud sessions"
      action={
        <div className="flex items-center gap-2">
          <SecondaryAction onClick={onSkip}>Skip</SecondaryAction>
          <SecondaryAction onClick={onTurnOnCloud}>Turn on</SecondaryAction>
        </div>
      }
    />
  );

  return (
    <>
      {cloudRow}
      <NexiWelcomePhoneRow onOpen={onSetupPhone} />
    </>
  );
}
