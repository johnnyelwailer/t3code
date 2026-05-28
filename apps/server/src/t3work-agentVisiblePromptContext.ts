import type { OrchestrationMessage, ThreadId, T3workMessageAttachment } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseBase64DataUrl } from "./imageMime.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

function formatAttachmentDetails(details: ReadonlyArray<string | undefined>): string {
  const definedDetails = details.filter((detail): detail is string => Boolean(detail));
  if (definedDetails.length === 0) {
    return "";
  }

  return ` (${definedDetails.join("; ")})`;
}

function isTextualAttachmentMimeType(mimeType: string | undefined): boolean {
  const normalized = mimeType?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

function projectAttachmentDataUrl(
  url: string | undefined,
  mimeType: string | undefined,
): string | null {
  if (!url || !isTextualAttachmentMimeType(mimeType)) {
    return null;
  }

  const parsed = parseBase64DataUrl(url);
  if (!parsed || !isTextualAttachmentMimeType(parsed.mimeType)) {
    return null;
  }

  const text = Buffer.from(parsed.base64, "base64").toString("utf8").trim();
  return text.length > 0 ? text : null;
}

function formatSnapshotFields(fields: unknown): string | null {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null;
  }

  const json = JSON.stringify(fields, null, 2)?.trim();
  return json ? json : null;
}

function describeAgentVisibleAttachment(attachment: T3workMessageAttachment): string {
  switch (attachment.kind) {
    case "artifact": {
      return `Artifact attachment: ${attachment.artifact.label}${formatAttachmentDetails([
        attachment.artifact.kind,
        attachment.artifact.path,
        attachment.artifact.url,
        attachment.artifact.summary,
      ])}`;
    }
    case "file": {
      const projectedContents = projectAttachmentDataUrl(
        attachment.file.url,
        attachment.file.mimeType,
      );
      const header = `File attachment: ${attachment.file.label}${formatAttachmentDetails([
        attachment.file.mimeType,
        attachment.file.sizeBytes ? `${attachment.file.sizeBytes} bytes` : undefined,
        projectedContents ? undefined : "contents not yet projected",
      ])}`;
      return projectedContents ? `${header}\n${projectedContents}` : header;
    }
    case "image": {
      // TODO: replace this placeholder text when we can safely project image/media content.
      return `Image attachment: ${attachment.image.label}${formatAttachmentDetails([
        attachment.image.mimeType,
        attachment.alt ? `alt: ${attachment.alt}` : undefined,
        "media contents not yet projected",
      ])}`;
    }
    case "resource": {
      const resourceRef =
        "ref" in attachment.resource ? attachment.resource.ref : attachment.resource;
      const resourceLabel = resourceRef.displayId
        ? `${resourceRef.displayId} - ${resourceRef.title}`
        : resourceRef.title;
      const header = `Resource attachment: ${resourceLabel}${formatAttachmentDetails([
        `${resourceRef.provider} ${resourceRef.kind}`,
        resourceRef.status ? `status: ${resourceRef.status}` : undefined,
        resourceRef.url,
      ])}`;
      const details: string[] = [];

      if ("ref" in attachment.resource) {
        if (attachment.resource.summary?.trim()) {
          details.push(attachment.resource.summary.trim());
        }
        if (attachment.resource.text?.trim()) {
          details.push(attachment.resource.text.trim());
        }
        const snapshotFields = formatSnapshotFields(attachment.resource.fields);
        if (snapshotFields) {
          details.push(snapshotFields);
        }
      }

      return details.length > 0 ? `${header}\n${details.join("\n")}` : header;
    }
    case "view": {
      return `View attachment: ${attachment.miniappId}`;
    }
  }
}

function describeAgentVisibleSystemMessage(message: OrchestrationMessage): ReadonlyArray<string> {
  if (message.role !== "system" || message.t3workExt?.visibleToAgent === false) {
    return [];
  }

  const entries: string[] = [];
  const text = message.text.trim();
  if (text.length > 0) {
    entries.push(text);
  }

  for (const attachment of message.t3workExt?.attachments ?? []) {
    entries.push(describeAgentVisibleAttachment(attachment));
  }

  return entries;
}

export function formatAgentVisiblePromptContext(
  messages: ReadonlyArray<OrchestrationMessage>,
): string {
  const entries = messages.flatMap(describeAgentVisibleSystemMessage);
  if (entries.length === 0) {
    return "";
  }

  return ["Workflow context:", ...entries.map((entry) => `- ${entry}`)].join("\n");
}

export function prependAgentVisiblePromptContext(input: {
  promptText: string;
  contextText: string;
}): string {
  const promptText = input.promptText.trim();
  const contextText = input.contextText.trim();

  if (contextText.length === 0) {
    return promptText;
  }
  if (promptText.length === 0) {
    return contextText;
  }

  return `${contextText}\n\nUser request:\n${promptText}`;
}

export const loadAgentVisiblePromptContext = Effect.fn("loadAgentVisiblePromptContext")(function* (
  threadId: ThreadId,
) {
  const projectionSnapshotQuery = yield* Effect.serviceOption(ProjectionSnapshotQuery);
  if (Option.isNone(projectionSnapshotQuery)) {
    return "";
  }

  const thread = yield* projectionSnapshotQuery.value.getThreadDetailById(threadId).pipe(
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  );
  if (!thread) {
    return "";
  }

  return formatAgentVisiblePromptContext(thread.messages);
});
