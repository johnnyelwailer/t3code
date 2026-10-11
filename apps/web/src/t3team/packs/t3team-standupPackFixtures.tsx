/**
 * A fixture pack web module, written exactly as a distribution pack's `web/index.ts` would be: it
 * imports only `@t3team/pack-ui`, `effect` and `react`. A "standup" pack registers one
 * `message.view`, `standup.notes`, which a workflow posts with
 * `getThread()?.showView({ key, viewId: "standup.notes", props: { day, notes } })`.
 *
 * Used by the registry tests and the pack view story; not part of the app.
 */
import {
  Badge,
  Button,
  defineWebActivate,
  Markdown,
  type MessageViewProps,
  Skeleton,
  usePackDocuments,
} from "@t3team/pack-ui";
import { T3TeamThreadArtifact } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useState } from "react";

const StandupNotesProps = Schema.Struct({
  day: Schema.String,
  notes: Schema.Array(Schema.String),
});
type StandupNotesProps = typeof StandupNotesProps.Type;

function StandupNotesCard({ props }: MessageViewProps<StandupNotesProps>) {
  const [expanded, setExpanded] = useState(true);
  const earlier = usePackDocuments("standup", { prefix: `standup/${props.day}/` });
  return (
    <section className="rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Standup · {props.day}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="info" size="sm">
            {props.notes.length} notes
          </Badge>
          <Button variant="ghost-muted" size="xs" onClick={() => setExpanded((open) => !open)}>
            {expanded ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-2 text-sm">
          <Markdown text={props.notes.map((note) => `- ${note}`).join("\n")} />
        </div>
      ) : null}
      {earlier.status === "loading" ? <Skeleton className="mt-2 h-3 w-24" /> : null}
      {earlier.status === "ready" ? (
        <p className="mt-2 text-xs text-muted-foreground">{earlier.value.length} earlier entries</p>
      ) : null}
    </section>
  );
}

export const STANDUP_NOTES_VIEW_ID = "standup.notes";

const decodeArtifact = Schema.decodeSync(T3TeamThreadArtifact);

export const standupPackWebModule = {
  packId: "standup",
  activate: defineWebActivate((context) => {
    context.registerView({
      slot: "message.view",
      id: STANDUP_NOTES_VIEW_ID,
      props: StandupNotesProps,
      component: StandupNotesCard,
    });
  }),
};

/**
 * The thread artifact the server writes for a `showView` (`t3team-workflowEngineBrokerShowView.ts`
 * through the workflow host's `message-ext` split): no message of its own, so the timeline shows
 * it as a standalone row.
 */
export function standupShowViewArtifact(input: {
  readonly threadId: string;
  readonly key: string;
  readonly props: unknown;
}): T3TeamThreadArtifact {
  return decodeArtifact({
    id: `message-ext:t3team-wf-view:${input.threadId}:${input.key}`,
    threadId: input.threadId,
    messageId: null,
    kind: "message-ext",
    payload: {
      author: { kind: "system", workflowRunId: "run-standup" },
      visibleToUser: true,
      visibleToAgent: false,
      attachments: [{ kind: "view", miniappId: STANDUP_NOTES_VIEW_ID, props: input.props }],
    },
    createdAt: "2026-10-07T09:00:00.000Z",
    updatedAt: "2026-10-07T09:00:00.000Z",
  });
}
