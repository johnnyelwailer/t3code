import type { OrchestrationMessage, ThreadId, T3workMessageAttachment } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

function formatAttachmentDetails(details: ReadonlyArray<string | undefined>): string {
  const definedDetails = details.filter((detail): detail is string => Boolean(detail));
  if (definedDetails.length === 0) {
    return "";
  }

  return ` (${definedDetails.join("; ")})`;
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
      return `File attachment: ${attachment.file.label}${formatAttachmentDetails([
        attachment.file.mimeType,
        attachment.file.sizeBytes ? `${attachment.file.sizeBytes} bytes` : undefined,
        "contents not yet projected",
      ])}`;
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

      return `Resource attachment: ${resourceLabel}${formatAttachmentDetails([
        `${resourceRef.provider} ${resourceRef.kind}`,
        resourceRef.status ? `status: ${resourceRef.status}` : undefined,
        resourceRef.url,
      ])}`;
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
