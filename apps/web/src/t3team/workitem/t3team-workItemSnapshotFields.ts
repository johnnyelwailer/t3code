import type { ResourceSnapshot } from "@t3tools/project-context";

import type { ProjectTicket } from "~/t3team/t3team-types";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  readNumber,
  readPerson,
  readRecord,
  readString,
  readStringList,
  readTimestampMs,
} from "~/t3team/workitem/t3team-workItemFieldReaders";
import { readStoryPoints } from "~/t3team/workitem/t3team-workItemPlanningReaders";
import {
  readTimeTrackingFromTicket,
  resolveSprints,
} from "~/t3team/workitem/t3team-workItemTicketFallbacks";
import {
  readNamedRefList,
  readParentRef,
  readStatus,
  readTimeTracking,
  readVoteState,
  readWatchState,
} from "~/t3team/workitem/t3team-workItemStructuredReaders";

/**
 * Resolves the field model from a snapshot, reading the normalized `fields` bag first and falling
 * back to the raw Jira issue underneath it.
 *
 * The dual read is deliberate: `fields` is a curated projection that grows over time, while `raw`
 * is whatever Jira returned. Preferring the projection keeps behaviour stable, and falling through
 * to `raw` means a field becomes visible as soon as Jira sends it, without waiting for the
 * normalizer to learn about it.
 *
 * `ticket` supplies the cached backlog row so the view renders immediately, before the snapshot
 * request resolves.
 */
export function readWorkItemFieldModel(input: {
  readonly snapshot: ResourceSnapshot | null;
  readonly ticket?: ProjectTicket | undefined;
  readonly fallbackKey: string;
}): WorkItemFieldModel {
  const { snapshot, ticket, fallbackKey } = input;
  const fields = (snapshot?.fields ?? {}) as Record<string, unknown>;
  const raw = readRecord(readRecord(snapshot?.raw)?.fields) ?? {};

  const issueTypeRecord = readRecord(raw.issuetype);
  const watch = readWatchState(raw.watches);
  const vote = readVoteState(raw.votes);
  const normalizedLabels = readStringList(fields.labels);

  const draft = {
    key: ticket?.ref.displayId ?? snapshot?.ref.displayId ?? fallbackKey,
    title:
      readString(fields.summary) ??
      ticket?.ref.title ??
      snapshot?.ref.title ??
      ticket?.ref.displayId ??
      fallbackKey,
    url: ticket?.ref.url ?? snapshot?.ref.url,

    issueType: ticket?.issueType ?? readString(fields.type) ?? readString(issueTypeRecord?.name),
    issueTypeIconUrl:
      ticket?.issueTypeIconUrl ??
      readString(fields.typeIconUrl) ??
      readString(issueTypeRecord?.iconUrl),
    isSubtask:
      ticket?.issueTypeIsSubtask ??
      (typeof issueTypeRecord?.subtask === "boolean" ? issueTypeRecord.subtask : undefined),

    status:
      readStatus(raw.status) ??
      readStatus(fields.status) ??
      (ticket?.status ? { name: ticket.status } : undefined),
    resolution: readString(fields.resolution) ?? readString(readRecord(raw.resolution)?.name),
    priority: readString(fields.priority) ?? ticket?.priority,
    priorityIconUrl: readString(readRecord(raw.priority)?.iconUrl),

    assignee:
      readPerson(raw.assignee) ??
      readPerson(fields.assignee) ??
      (ticket?.assignee ? { displayName: ticket.assignee } : undefined),
    reporter: readPerson(raw.reporter) ?? readPerson(fields.reporter),
    creator: readPerson(raw.creator),

    labels: normalizedLabels.length > 0 ? normalizedLabels : readStringList(raw.labels),
    components: readNamedRefList(raw.components ?? fields.components),
    fixVersions: readNamedRefList(raw.fixVersions ?? fields.fixVersions),
    affectsVersions: readNamedRefList(raw.versions ?? fields.affectsVersions),
    sprints: resolveSprints({ fields, raw, ticket }),

    createdMs: readTimestampMs(fields.created ?? raw.created),
    updatedMs:
      readTimestampMs(fields.updated ?? raw.updated) ?? readTimestampMs(snapshot?.fetchedAt),
    dueDateMs: readTimestampMs(fields.dueDate ?? raw.duedate),
    resolvedMs: readTimestampMs(fields.resolvedAt ?? raw.resolutiondate),

    storyPoints: readStoryPoints(fields, raw) ?? ticket?.estimateValue,
    timeTracking:
      readTimeTracking(fields.timeTracking) ??
      readTimeTracking(raw.timetracking) ??
      readTimeTrackingFromTicket(ticket),

    watchCount: watch.count ?? readNumber(fields.watchCount),
    isWatching: watch.isActive,
    voteCount: vote.count ?? readNumber(fields.voteCount),
    hasVoted: vote.isActive,

    environment: readString(fields.environment) ?? readString(raw.environment),
    parent: readParentRef(raw.parent ?? fields.parentSummary),

    descriptionAdf: readAdfDocument(raw.description) ?? readAdfDocument(fields.descriptionAdf),
    /*
      No fallback to `snapshot.text`. That field is built by `normalize.ts` as
      `description + "Comments:" + every comment` for search and agent context — rendering it as the
      description put the whole comment thread inside the Description section, above the Comments
      section that already showed the same text. An issue with no description has no description;
      the renderer already says so.
    */
    descriptionText: readString(fields.description),
    descriptionHtml: readString(fields.descriptionHtml),
  };

  return omitUndefined(draft);
}

/**
 * Drops absent keys instead of setting them to `undefined`.
 *
 * `exactOptionalPropertyTypes` treats an explicit `undefined` as a distinct value from an absent
 * key, so every optional field has to be omitted rather than assigned. Doing that with conditional
 * spreads produced a union type large enough for the compiler to give up on (TS2590), so the object
 * is built flat and stripped once here.
 *
 * The cast is sound because the required members of `WorkItemFieldModel` — `key`, `title`, and the
 * five list fields — are unconditionally assigned above and can never be `undefined`.
 */
function omitUndefined(draft: Record<string, unknown>): WorkItemFieldModel {
  const entries = Object.entries(draft).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as unknown as WorkItemFieldModel;
}

/** ADF documents are objects; a string here is the plain-text projection, not a document. */
function readAdfDocument(value: unknown): unknown {
  return value && typeof value === "object" ? value : undefined;
}
