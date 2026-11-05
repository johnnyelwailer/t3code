import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { EnvironmentId, MessageId, type ScopedThreadRef } from "@t3tools/contracts";

import { MessageReplyButton } from "~/components/chat/MessageReplyButton";
import { UserMessageContextReferenceChip } from "~/components/chat/UserMessageContextChips";
import { TimelineRowCtx, type TimelineRowSharedState } from "~/components/chat/timelineRowContext";
import {
  ComposerContextReferenceChip,
  ComposerContextRecordsContext,
  composerContextRecordsFromDraft,
} from "~/components/composerContextPresentation";
import { messageQuoteContextRecord } from "~/lib/composerContextRecords";
import { type MessageQuoteContextRecord } from "@t3tools/contracts";

const noop = () => {};
const noopAsync = async () => {};

const rowContext: TimelineRowSharedState = {
  pendingApprovals: new Map(),
  respondingRequestIds: [],
  canOperateThread: true,
  onRespondToApproval: undefined,
  citationRequest: null,
  listRef: { current: null },
  timestampFormat: "locale",
  routeThreadKey: "thread",
  threadRef: null as ScopedThreadRef | null,
  markdownCwd: undefined,
  resolvedTheme: "light",
  workspaceRoot: undefined,
  skills: [],
  runs: [],
  activeThreadEnvironmentId: EnvironmentId.make("cloud"),
  onRevertToTurnCount: noop,
  onUseArtifactTemplate: noop,
  onSendAppMessage: undefined,
  onAppFullscreenChange: noop,
  onRunShellCommand: undefined,
  findActive: false,
  onImageExpand: noop,
  onOpenToolDiff: undefined,
  onOpenTurnDiff: noop,
  renderHtmlRender: undefined,
  turnItemSource: undefined,
  onOpenThread: noop,
  workflowOpening: null,
  onForkFromRun: noopAsync,
  onQuoteMessage: noop,
  onToggleTurnFold: noop,
  onToggleAttemptFold: noop,
  onFileOpen: noop,
  onFileDownload: noop,
  openPullRequest: noop,
  onToggleWorkGroup: noop,
  onToggleWorkEntry: noop,
  onCancelWorktreeSetup: null,
  retryableWorkspacePreparationRunIds: new Set(),
  onRetryWorkspacePreparation: null,
  onWorktreeSetupWorkLocally: null,
  onOpenWorktreeSetupTerminal: noop,
  workGroupViewState: { scrollPositions: new Map(), expandedEntries: new Set() },
  threadJobsController: undefined,
  backgroundJobStarters: new Map(),
};

function WithRowContext({ children }: { children: ReactNode }) {
  return <TimelineRowCtx.Provider value={rowContext}>{children}</TimelineRowCtx.Provider>;
}

const QUOTE_TEXT =
  "The login page 500s when the form is empty.\n\nCheck the stack trace in the server log, " +
  "the handler reads `req.body.email` without a guard.";

const quote = messageQuoteContextRecord({
  messageId: MessageId.make("msg-quote-1"),
  author: "T3 Code",
  text: QUOTE_TEXT,
});

function composerRecords(record: MessageQuoteContextRecord) {
  return composerContextRecordsFromDraft({
    terminalContexts: [],
    messageQuotes: [record],
  });
}

function sentChip(record: MessageQuoteContextRecord) {
  return (
    <WithRowContext>
      <UserMessageContextReferenceChip
        reference={{
          kind: "message-quote",
          contextId: record.contextId,
          label: record.label,
        }}
        record={record}
        annotationImage={null}
        attachment={null}
        onExpandImage={noop}
        onExpandVideo={noop}
        onOpenFile={noop}
      />
    </WithRowContext>
  );
}

const meta = {
  title: "Chat/MessageReplyQuote",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The reply button as it sits in a row's action row, next to Copy and Fork. */
export const ReplyButton: Story = {
  render: () => (
    <div className="flex items-center gap-1">
      <WithRowContext>
        <MessageReplyButton
          messageId={MessageId.make("msg-quote-1")}
          author="T3 Code"
          text={QUOTE_TEXT}
        />
      </WithRowContext>
    </div>
  ),
};

/** The composer chip after a message has been quoted; the popover shows author and quoted text. */
export const ComposerChip: Story = {
  render: () => (
    <ComposerContextRecordsContext.Provider value={composerRecords(quote)}>
      <ComposerContextReferenceChip
        kind="message-quote"
        contextId={quote.contextId}
        label={quote.label}
      />
    </ComposerContextRecordsContext.Provider>
  ),
};

/** The quote chip on a sent message. */
export const SentMessageChip: Story = {
  render: () => sentChip(quote),
};

/** A long quote collapses to the chip; the popover scrolls. */
export const LongQuotedText: Story = {
  render: () =>
    sentChip(
      messageQuoteContextRecord({
        messageId: MessageId.make("msg-quote-long"),
        author: "You",
        text: Array.from(
          { length: 60 },
          (_, index) => `line ${index + 1} of the quoted message`,
        ).join("\n"),
      }),
    ),
};
