import type {
  T3workActionRecipeArtifact,
  T3workActionRecipeContext,
  T3workActionRecipeLinkedResource,
  T3workActionRecipeWorkitem,
} from "@t3tools/project-context";
import type { T3workMessageAttachment, T3workMessageExternalResourceRef } from "@t3tools/contracts";

function trimText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeResourceKind(kind: string | undefined): T3workMessageExternalResourceRef["kind"] {
  const normalized = kind?.trim().toLowerCase() ?? "";
  if (normalized.includes("pull") && normalized.includes("request")) return "pull-request";
  if (normalized.includes("epic")) return "epic";
  if (normalized.includes("page") || normalized.includes("document")) return "page";
  if (normalized.includes("issue")) return "issue";
  return "ticket";
}

function buildResourceSnapshot(input: {
  provider?: string;
  kind?: string;
  id?: string;
  displayId?: string;
  title?: string;
  url?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  type?: string;
  summary?: string;
  fields?: Record<string, unknown>;
  fetchedAt: string;
}): Extract<T3workMessageAttachment, { kind: "resource" }> | null {
  const title = trimText(input.title) || trimText(input.displayId);
  const id = trimText(input.id) || trimText(input.displayId) || title;
  if (!title || !id) {
    return null;
  }

  return {
    kind: "resource",
    resource: {
      ref: {
        provider: trimText(input.provider) || "t3work",
        kind: normalizeResourceKind(input.kind),
        id,
        title,
        ...(trimText(input.displayId) ? { displayId: trimText(input.displayId) } : {}),
        ...(trimText(input.type) ? { type: trimText(input.type) } : {}),
        ...(trimText(input.url) ? { url: trimText(input.url) } : {}),
        ...(trimText(input.status) ? { status: trimText(input.status) } : {}),
        ...(trimText(input.priority) ? { priority: trimText(input.priority) } : {}),
        ...(trimText(input.assignee) ? { assignee: trimText(input.assignee) } : {}),
      },
      fetchedAt: input.fetchedAt,
      ...(trimText(input.summary) ? { summary: trimText(input.summary) } : {}),
      fields: input.fields ?? {},
    },
  };
}

function buildArtifactAttachment(
  artifact: T3workActionRecipeArtifact,
): Extract<T3workMessageAttachment, { kind: "artifact" }> {
  const summary =
    typeof artifact.raw?.summary === "string"
      ? artifact.raw.summary
      : typeof artifact.raw?.description === "string"
        ? artifact.raw.description
        : undefined;

  return {
    kind: "artifact",
    artifact: {
      kind: artifact.kind,
      label: trimText(artifact.label) || artifact.kind,
      ...(trimText(artifact.path) ? { path: trimText(artifact.path) } : {}),
      ...(trimText(summary) ? { summary: trimText(summary) } : {}),
    },
  };
}

function buildLinkedResourceAttachment(input: {
  resource: T3workActionRecipeLinkedResource;
  createdAt: string;
}) {
  const title = trimText(input.resource.title) || trimText(input.resource.label);
  return buildResourceSnapshot({
    ...(input.resource.provider ? { provider: input.resource.provider } : {}),
    ...(input.resource.kind ? { kind: input.resource.kind } : {}),
    ...(input.resource.id ? { id: input.resource.id } : {}),
    ...(input.resource.label ? { displayId: input.resource.label } : {}),
    title,
    ...(input.resource.url ? { url: input.resource.url } : {}),
    summary: title,
    ...(input.resource.raw ? { fields: input.resource.raw } : {}),
    fetchedAt: input.createdAt,
  });
}

function buildWorkitemAttachment(input: {
  workitem: T3workActionRecipeWorkitem;
  createdAt: string;
}) {
  return buildResourceSnapshot({
    ...(input.workitem.provider ? { provider: input.workitem.provider } : {}),
    ...(input.workitem.kind ? { kind: input.workitem.kind } : {}),
    ...(input.workitem.id ? { id: input.workitem.id } : {}),
    ...(input.workitem.displayId ? { displayId: input.workitem.displayId } : {}),
    ...(input.workitem.title ? { title: input.workitem.title } : {}),
    ...(input.workitem.url ? { url: input.workitem.url } : {}),
    ...(input.workitem.status ? { status: input.workitem.status } : {}),
    ...(input.workitem.priority ? { priority: input.workitem.priority } : {}),
    ...(input.workitem.assignee ? { assignee: input.workitem.assignee } : {}),
    ...(input.workitem.type ? { type: input.workitem.type } : {}),
    ...(input.workitem.title ? { summary: input.workitem.title } : {}),
    fields: {
      ...(input.workitem.status ? { status: input.workitem.status } : {}),
      ...(input.workitem.priority ? { priority: input.workitem.priority } : {}),
      ...(input.workitem.assignee ? { assignee: input.workitem.assignee } : {}),
      ...(input.workitem.assigneeRelation
        ? { assigneeRelation: input.workitem.assigneeRelation }
        : {}),
      ...(input.workitem.estimateValue !== undefined
        ? { estimateValue: input.workitem.estimateValue }
        : {}),
      ...(input.workitem.relationships ? { relationships: input.workitem.relationships } : {}),
      ...(input.workitem.github ? { github: input.workitem.github } : {}),
      ...(input.workitem.raw ? { raw: input.workitem.raw } : {}),
    },
    fetchedAt: input.createdAt,
  });
}

export function buildRecipeWorkflowAgentBootstrapText(input: {
  renderedPromptText: string;
  agentPromptText: string;
}): string {
  const renderedPromptText = trimText(input.renderedPromptText);
  const agentPromptText = trimText(input.agentPromptText);
  const sections = renderedPromptText ? [renderedPromptText] : [];

  if (agentPromptText && agentPromptText !== renderedPromptText) {
    sections.push(`Additional agent instructions:\n${agentPromptText}`);
  }

  return sections.join("\n\n");
}

export function buildRecipeWorkflowAgentBootstrapAttachments(input: {
  workflowRunId: string;
  contextJson: string;
  createdAt: string;
  launchContext?: T3workActionRecipeContext;
}): ReadonlyArray<T3workMessageAttachment> {
  const attachments: T3workMessageAttachment[] = [
    {
      kind: "file",
      file: {
        id: `t3work:recipe-context:${input.workflowRunId}`,
        label: "Recipe context (context.json)",
        url: `data:application/json;base64,${Buffer.from(input.contextJson, "utf8").toString("base64")}`,
        mimeType: "application/json",
        sizeBytes: Buffer.byteLength(input.contextJson, "utf8"),
      },
    },
  ];

  const seenResourceKeys = new Set<string>();
  const pushResource = (
    attachment: Extract<T3workMessageAttachment, { kind: "resource" }> | null,
  ) => {
    if (!attachment) {
      return;
    }
    const resource = "ref" in attachment.resource ? attachment.resource.ref : attachment.resource;
    const resourceKey = [resource.provider, resource.kind, resource.id, resource.url ?? ""].join(
      ":",
    );
    if (seenResourceKeys.has(resourceKey)) {
      return;
    }
    seenResourceKeys.add(resourceKey);
    attachments.push(attachment);
  };

  if (input.launchContext?.workitem) {
    pushResource(
      buildWorkitemAttachment({
        workitem: input.launchContext.workitem,
        createdAt: input.createdAt,
      }),
    );
  }

  for (const resource of input.launchContext?.linkedResources.items ?? []) {
    pushResource(buildLinkedResourceAttachment({ resource, createdAt: input.createdAt }));
  }

  for (const artifact of input.launchContext?.artifacts.items ?? []) {
    attachments.push(buildArtifactAttachment(artifact));
  }

  return attachments;
}
