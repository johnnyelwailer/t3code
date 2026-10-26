import type { Meta, StoryObj } from "@storybook/react";
import { ThreadId, type UserSecretApprovalRequest } from "@t3tools/contracts";

import { T3TeamUserSecretApprovalCard } from "~/t3team/chat/t3team-UserSecretApprovalCard";

/**
 * The card an agent's `t3_user_secret_run` raises above the composer when a granted secret needs
 * the user's approval. The same card the thread docks, with requests shaped like the server's.
 */
const meta = {
  title: "T3Team/Chat/User Secret Approval",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const base: UserSecretApprovalRequest = {
  id: "8d3c2f0e-6a1b-4c55-9d1e-2f6c7b8a9e10",
  threadId: ThreadId.make("thread-demo"),
  secretNames: ["JIRA_API_TOKEN"],
  mode: "processInjection",
  command:
    'curl -sS -H "Authorization: Bearer $(cat "$JIRA_API_TOKEN_FILE")" https://jira.example.com/rest/api/2/myself',
  destination: "jira.example.com",
  purpose: "Check which Jira account the token belongs to before creating the sub-tasks.",
  rememberScope: "thread",
  requestedAt: "2026-10-26T09:14:00.000Z",
};

const frame = (request: UserSecretApprovalRequest, error: string | null = null, busy = false) => (
  <div className="w-[34rem]">
    <T3TeamUserSecretApprovalCard request={request} busy={busy} error={error} onDecide={() => {}} />
  </div>
);

export const PerThread: Story = { render: () => frame(base) };

export const PerMachine: Story = {
  render: () => frame({ ...base, rememberScope: "machine" }),
};

export const EveryUse: Story = {
  render: () =>
    frame({
      ...base,
      rememberScope: undefined,
      secretNames: ["DB_PASSWORD"],
      command: 'psql "host=db.internal.example.com user=app" -c "select count(*) from orders"',
      destination: "db.internal.example.com",
      purpose: "Count today's orders to confirm the import finished.",
    }),
};

export const SeveralSecrets: Story = {
  render: () =>
    frame({
      ...base,
      secretNames: ["NPM_TOKEN", "REGISTRY_USER"],
      command: "npm publish --registry https://npm.example.com",
      destination: "npm.example.com",
      purpose: "Publish the 2.4.0 package after the release PR merged.",
    }),
};

export const RequestInjection: Story = {
  render: () =>
    frame({
      ...base,
      mode: "requestInjection",
      command: 'curl -sS "$JIRA_API_TOKEN_BASE_URL/rest/api/2/myself"',
    }),
};

export const AnswerFailed: Story = {
  render: () => frame(base, "Could not send your answer. Try again."),
};
