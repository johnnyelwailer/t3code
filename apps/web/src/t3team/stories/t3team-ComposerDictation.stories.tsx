import type { Meta, StoryObj } from "@storybook/react";
import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { useLayoutEffect, useRef, useState } from "react";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditorTiptap";
import { ComposerPrimaryActions } from "~/components/chat/ComposerPrimaryActions";
import {
  DesktopComposerVoiceControl,
  dictationGhostText,
} from "~/components/chat/t3team-DesktopComposerVoiceControl";

/**
 * Desktop composer dictation, beside a running turn: the live words are ghost text in the draft
 * (an ellipsis before the first word), the placeholder steps aside, and the recording control
 * (cancel, finish) never reads as the run's red stop button.
 */
function ComposerDictation(props: {
  readonly phase: VoiceInputState["phase"];
  readonly label?: string;
  readonly draft?: string;
  /** What the transcriber has heard so far; "" before the first word. */
  readonly partial?: string;
  readonly running?: boolean;
}) {
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const [cursor, setCursor] = useState(() => props.draft?.length ?? 0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes the ghost into the ProseMirror view
  useLayoutEffect(() => {
    editorRef.current?.setVoiceGhost(dictationGhostText(props.phase, props.partial ?? ""));
  }, [props.phase, props.partial]);
  return (
    <div className="flex w-full max-w-[720px] flex-col bg-background p-4">
      <div className="rounded-3xl border border-border bg-card px-4 pt-3 pb-2 shadow-xs">
        <ComposerPromptEditorTiptap
          editorRef={editorRef}
          value={props.draft ?? ""}
          cursor={cursor}
          richTextEnabled={false}
          contextRecords={new Map()}
          skills={[]}
          disabled={false}
          placeholder="Frag nach Status, Tickets oder Pull Requests im Projekt Nexi Work"
          onChange={(_next, nextCursor) => setCursor(nextCursor)}
          onPaste={() => {}}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">Nexplore AI · Ausgewogen</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <DesktopComposerVoiceControl
              phase={props.phase}
              label={props.label ?? "Dictate"}
              disabled={false}
              onToggle={() => undefined}
              onCancel={() => undefined}
            />
            <ComposerPrimaryActions
              compact={false}
              canOperateThread
              pendingAction={null}
              isRunning={props.running ?? true}
              canInterrupt={props.running ?? true}
              showPlanFollowUpPrompt={false}
              promptHasText={(props.draft ?? "").length > 0}
              isSendBusy={false}
              sendDisabledReason={null}
              isEnvironmentUnavailable={false}
              isPreparingWorktree={false}
              hasSendableContent={(props.draft ?? "").length > 0}
              onPreviousPendingQuestion={() => undefined}
              onInterrupt={() => undefined}
              onImplementPlanInNewThread={() => undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "t3team/Voice/ComposerDictation",
  component: ComposerDictation,
  args: { phase: "recording" },
} satisfies Meta<typeof ComposerDictation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ListeningEmptyDraft: Story = {};
export const StreamingEmptyDraft: Story = {
  args: {
    partial:
      "Bitte öffne das Board der Abteilung Tiefbau und prüfe, ob der Release-Branch für die Kundenfreigabe grün ist",
  },
};
export const StreamingAfterDraft: Story = {
  args: {
    draft:
      "Fasse die offenen Pull Requests für die Grundbuchschnittstelle zusammen und markiere Blocker.",
    partial: "Danach erstelle einen Entwurf für die Rückmeldung an das Vermessungsamt",
  },
};
export const PreparingModel: Story = {
  args: { phase: "preparing", label: "Sprachmodell wird geladen (42 %)", running: false },
};
export const IdleBesideRunningTurn: Story = { args: { phase: "idle" } };
