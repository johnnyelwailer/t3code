import type { IntegrationProvider } from "./provider.ts";
import type {
  CommitMutationInput,
  IntegrationAccount,
  IntegrationAccountRef,
  IntegrationAction,
  IntegrationSearchInput,
  ListResourcesInput,
  MutationResult,
  PrepareMutationInput,
  PreparedMutation,
  ResourceSearchResult,
} from "./types.ts";

import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";
import type { ExternalProject } from "./types.ts";

const MOCK_ACCOUNTS: ReadonlyArray<IntegrationAccount> = [
  {
    id: "atl-site-acme",
    provider: "atlassian",
    label: "Acme Cloud",
    accountUrl: "https://acme.atlassian.net",
  },
  {
    id: "atl-site-civic",
    provider: "atlassian",
    label: "Civic Services",
    accountUrl: "https://civic-services.atlassian.net",
  },
];

const MOCK_PROJECTS: ReadonlyArray<ExternalProject> = [
  {
    id: "jira-proj-einb",
    provider: "atlassian",
    title: "Einbürgerungsportal Kanton Zürich",
    key: "EINB",
    url: "https://civic-services.atlassian.net/jira/software/c/projects/EINB",
    description: "Online-Gesuch, QA signoff, and release readiness.",
    raw: {
      siteId: "atl-site-civic",
      projectTypeKey: "software",
      recentIssueCount: 18,
      lastIssueUpdatedAt: "2026-05-14T15:34:00.000Z",
      avatarColor: "#0052CC",
    },
  },
  {
    id: "jira-proj-checkout",
    provider: "atlassian",
    title: "Acme Checkout",
    key: "AC",
    url: "https://acme.atlassian.net/jira/software/c/projects/AC",
    description: "Cart, payment, and checkout customer experience.",
    raw: {
      siteId: "atl-site-acme",
      projectTypeKey: "software",
      recentIssueCount: 27,
      lastIssueUpdatedAt: "2026-05-15T08:12:00.000Z",
      avatarColor: "#36B37E",
    },
  },
  {
    id: "jira-proj-support",
    provider: "atlassian",
    title: "Customer Support Portal",
    key: "CSP",
    url: "https://acme.atlassian.net/jira/servicedesk/projects/CSP",
    description: "Support intake, triage, and customer-facing issue follow-up.",
    raw: {
      siteId: "atl-site-acme",
      projectTypeKey: "service_desk",
      recentIssueCount: 42,
      lastIssueUpdatedAt: "2026-05-15T09:25:00.000Z",
      avatarColor: "#FF5630",
    },
  },
];

const MOCK_RESOURCE_ITEMS = [
  {
    provider: "atlassian",
    kind: "issue",
    id: "einb-218",
    displayId: "EINB-218",
    type: "Bug",
    title: "Signature pad loses points inside iOS web view",
    url: "https://civic-services.atlassian.net/browse/EINB-218",
    projectId: "jira-proj-einb",
  },
  {
    provider: "atlassian",
    kind: "issue",
    id: "einb-224",
    displayId: "EINB-224",
    type: "Story",
    title: "Clarify residence document upload error copy",
    url: "https://civic-services.atlassian.net/browse/EINB-224",
    projectId: "jira-proj-einb",
  },
  {
    provider: "atlassian",
    kind: "issue",
    id: "ac-91",
    displayId: "AC-91",
    type: "Task",
    title: "Payment retry banner overlaps coupon field",
    url: "https://acme.atlassian.net/browse/AC-91",
    projectId: "jira-proj-checkout",
  },
  {
    provider: "atlassian",
    kind: "issue",
    id: "csp-340",
    displayId: "CSP-340",
    type: "Sub-task",
    title: "Refund request SLA wording is inconsistent",
    url: "https://acme.atlassian.net/browse/CSP-340",
    projectId: "jira-proj-support",
  },
] as const;

const MOCK_RESOURCES: ResourcePage = {
  items: [...MOCK_RESOURCE_ITEMS],
  totalCount: MOCK_RESOURCE_ITEMS.length,
};

const MOCK_SNAPSHOTS: Record<string, ResourceSnapshot> = {
  "einb-218": {
    ref: MOCK_RESOURCE_ITEMS[0],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    summary: "Signature strokes are dropped when applicants sign inside the iOS wrapper.",
    fields: {
      status: "In Review",
      type: "Bug",
      priority: "High",
      assignee: "Laura Meier",
      reporter: "Daniel Keller",
      labels: ["mobile", "ios", "qa-risk"],
      description: "On iOS web views, fast touch movements are sometimes dropped.",
    },
    text: "On iOS web views, fast touch movements are sometimes dropped. Acceptance criteria require 60+ points to persist and a clear inline error for too-short signatures.",
  },
  "einb-224": {
    ref: MOCK_RESOURCE_ITEMS[1],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    summary: "The upload error copy needs to be testable and citizen-friendly.",
    fields: {
      status: "Open",
      type: "Story",
      priority: "Medium",
      assignee: "Nina Graf",
      reporter: "QA Pool",
      labels: ["copy", "documents"],
      description: "Several invalid file states currently use the same generic error.",
    },
    text: "Several invalid file states currently use the same generic error. QA needs clear cases for size, type, password protection, and upload timeout.",
  },
  "ac-91": {
    ref: MOCK_RESOURCE_ITEMS[2],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    summary: "The retry banner can cover coupon input on narrow mobile widths.",
    fields: {
      status: "Open",
      type: "Task",
      priority: "High",
      assignee: "Maya Chen",
      reporter: "Support",
      labels: ["checkout", "mobile", "regression"],
      description: "After failed 3DS payment, the retry banner overlaps coupon input.",
    },
    text: "After failed 3DS payment, the retry banner overlaps coupon input on 375px and 390px widths.",
  },
  "csp-340": {
    ref: MOCK_RESOURCE_ITEMS[3],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    summary: "Refund request SLA copy differs between portal and email.",
    fields: {
      status: "Selected for Development",
      type: "Sub-task",
      priority: "Medium",
      assignee: "Support Platform",
      reporter: "Operations",
      labels: ["support", "copy"],
      description: "Portal says 3 business days while email says 5 business days.",
    },
    text: "Portal says 3 business days while email says 5 business days. QA needs a copy consistency pass.",
  },
};

export class MockIntegrationProvider implements IntegrationProvider {
  // Deterministic ids keep mock-driven flows reproducible.
  private preparedMutationCount = 0;

  readonly id = "atlassian";
  readonly kind = "atlassian";

  async listAccounts(): Promise<ReadonlyArray<IntegrationAccount>> {
    return MOCK_ACCOUNTS;
  }

  async listProjects(_account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
    return MOCK_PROJECTS.filter((project) => {
      const raw = project.raw as { siteId?: string } | undefined;
      return raw?.siteId === _account.id;
    });
  }

  async listResources(input: ListResourcesInput): Promise<ResourcePage> {
    const filtered = MOCK_RESOURCES.items.filter(
      (item) => item.projectId === input.externalProjectId,
    );
    return { items: filtered, totalCount: filtered.length };
  }

  async getResource(ref: unknown): Promise<ResourceSnapshot> {
    const typedRef = ref as { id: string };
    const snapshot = MOCK_SNAPSHOTS[typedRef.id];
    if (!snapshot) {
      throw new Error(`Mock resource not found: ${typedRef.id}`);
    }
    return snapshot;
  }

  async downloadAsset(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
    return {
      bytes: new TextEncoder().encode(url),
      mimeType: "application/octet-stream",
    };
  }

  async search(_input: IntegrationSearchInput): Promise<ReadonlyArray<ResourceSearchResult>> {
    return [];
  }

  async getAvailableActions(_ref: unknown): Promise<ReadonlyArray<IntegrationAction>> {
    return [
      {
        id: "jira.comment.prepare",
        label: "Prepare Jira comment",
        kind: "mutate",
        requiresApproval: true,
      },
    ];
  }

  async prepareMutation(input: PrepareMutationInput): Promise<PreparedMutation> {
    return {
      mutationId: `mock-mutation-${++this.preparedMutationCount}`,
      preview: `Prepared mutation for action ${input.actionId}`,
      editableFields: ["body"],
      payload: input.payload,
    };
  }

  async commitMutation(_input: CommitMutationInput): Promise<MutationResult> {
    return { success: true };
  }
}
