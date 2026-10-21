import { ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { useComposerHandleContext } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { voicePreparingLabel } from "~/voice/t3team-voiceModelProgress";
import { VoiceProgress } from "./t3team-VoiceRowParts";
import { VoiceOrb } from "./t3team-VoiceOrb";
import { failedTitle } from "./t3team-voiceFailureCopy";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { useVoiceUiStore } from "./t3team-voiceUiStore";
import "~/t3team/voice/surface/t3team-voice.css";

function NoteShell(props: {
  readonly docked: boolean;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const controls = useVoiceUiStore((store) => store.controls);
  return (
    <div
      role={state === "preparing" ? "status" : "alert"}
      data-testid="voice-note"
      data-state={state}
      className={cn(VOICE_CLASS.scope, !props.docked && [VOICE_CLASS.enter, VOICE_CLASS.card])}
    >
      <div className="flex items-start gap-2.5">
        <VoiceOrb state={state} size="lg" onClick={() => controls?.toggle()} />
        <span className="flex-1 font-medium text-sm leading-6.5 text-foreground">
          {props.title}
        </span>
        {props.aside}
      </div>
      <div className="pl-9 pt-1.5 text-xs leading-normal text-muted-foreground">
        {props.children}
      </div>
    </div>
  );
}

function PreparingNote({ docked }: { readonly docked: boolean }) {
  const percent = useVoiceUiStore((store) => store.snapshot.downloadPercent);
  return (
    <NoteShell
      docked={docked}
      title="Preparing voice model"
      aside={
        percent === null ? null : (
          <span className="font-mono text-xs leading-6.5 tabular-nums text-foreground">
            {percent}%
          </span>
        )
      }
    >
      <div className="mt-1 mb-2">
        <VoiceProgress label={voicePreparingLabel(percent)} />
      </div>
      <span className="font-mono text-2xs">one-time download</span>
    </NoteShell>
  );
}

const systemMicrophoneSettingsPath = () =>
  navigator.platform.startsWith("Win")
    ? "Windows Settings → Privacy → Microphone"
    : "your system's privacy settings";

function DeniedNote({ docked }: { readonly docked: boolean }) {
  const controls = useVoiceUiStore((store) => store.controls);
  return (
    <NoteShell docked={docked} title="Microphone is blocked">
      <p className="mb-2.5">
        {controls?.openMicrophoneSettings
          ? `Allow the microphone in ${systemMicrophoneSettingsPath()}, then try again.`
          : "Allow the microphone for this page in your browser, then try again."}
      </p>
      <div className="flex items-center gap-1.5">
        {controls?.openMicrophoneSettings ? (
          <Button variant="secondary" size="compact" onClick={controls.openMicrophoneSettings}>
            <ExternalLinkIcon aria-hidden />
            Open settings
          </Button>
        ) : null}
        <Button variant="ghost-muted" size="compact" onClick={() => controls?.dismiss()}>
          Not now
        </Button>
      </div>
    </NoteShell>
  );
}

function FailedNote({ docked }: { readonly docked: boolean }) {
  const controls = useVoiceUiStore((store) => store.controls);
  const detail = useVoiceUiStore((store) => store.snapshot.failureDetail);
  const composer = useComposerHandleContext();
  const typeInstead = () => {
    controls?.dismiss();
    composer?.current?.focusAtEnd();
  };
  return (
    <NoteShell docked={docked} title={failedTitle(detail)}>
      <p className="mb-2.5">
        Nothing was written down. Try again, or type it instead.
        {detail === null ? null : <span className="block text-2xs opacity-70">{detail}</span>}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="compact" onClick={() => controls?.toggle()}>
          <RotateCcwIcon aria-hidden />
          Try again
        </Button>
        <Button variant="ghost-muted" size="compact" onClick={typeInstead}>
          Type it instead
        </Button>
      </div>
    </NoteShell>
  );
}

/** The calm failure and preparation states of the in-thread surface. */
export function VoiceNote(props: {
  readonly state: "preparing" | "denied" | "failed";
  readonly docked?: boolean;
}) {
  const docked = props.docked ?? false;
  if (props.state === "preparing") return <PreparingNote docked={docked} />;
  return props.state === "denied" ? <DeniedNote docked={docked} /> : <FailedNote docked={docked} />;
}
