/**
 * Reading fork thread artifacts as message ext and thread activities.
 *
 * The server splits a rich fork message (`t3team-workflowHostMessages.ts`) into the plain V2
 * message plus artifacts: one `message-ext` artifact with the ext's rich attachments (decision
 * cards, plan/shape views, resource refs) and one `widget` artifact per widget. Workflow progress
 * (`t3team.recipe.workflow.step`, `t3team.recipe.launch`, …) are activity artifacts whose payload
 * is `{ tone, summary, payload }`. Payloads are `unknown` on the wire, so each is decoded once per
 * artifact object (artifacts keep their identity across stream updates that do not touch them).
 */
import {
  T3TeamMessageExt,
  T3TeamMessageWidgetAttachment,
  type T3TeamThreadArtifact,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { T3TeamThreadActivityRecord } from "~/t3team/chat/t3team-threadActivityRecord";

export const T3TEAM_MESSAGE_EXT_ARTIFACT_KIND = "message-ext";
export const T3TEAM_WIDGET_ARTIFACT_KIND = "widget";
/** Fork activity artifacts are namespaced `t3team.<…>` (workflow steps, recipe launches). */
const ACTIVITY_KIND_PREFIX = "t3team.";

const decodeExt = Schema.decodeUnknownOption(T3TeamMessageExt);
const decodeWidget = Schema.decodeUnknownOption(T3TeamMessageWidgetAttachment);

const extByArtifact = new WeakMap<T3TeamThreadArtifact, T3TeamMessageExt | null>();

/** The message ext an artifact contributes: a `message-ext` payload, or a widget as an attachment. */
export function artifactMessageExt(artifact: T3TeamThreadArtifact): T3TeamMessageExt | null {
  const cached = extByArtifact.get(artifact);
  if (cached !== undefined) return cached;
  const ext =
    artifact.kind === T3TEAM_MESSAGE_EXT_ARTIFACT_KIND
      ? Option.getOrNull(decodeExt(artifact.payload))
      : artifact.kind === T3TEAM_WIDGET_ARTIFACT_KIND
        ? Option.match(decodeWidget(artifact.payload), {
            onNone: () => null,
            onSome: (widget): T3TeamMessageExt => ({ attachments: [widget] }),
          })
        : null;
  extByArtifact.set(artifact, ext);
  return ext;
}

/** Later exts win for scalar fields; attachments concatenate in order. */
export function mergeT3TeamMessageExts(
  exts: ReadonlyArray<T3TeamMessageExt | undefined>,
): T3TeamMessageExt | undefined {
  const present = exts.filter((ext): ext is T3TeamMessageExt => ext !== undefined);
  if (present.length <= 1) return present[0];
  const attachments = present.flatMap((ext) => ext.attachments ?? []);
  const { attachments: _last, ...scalars }: T3TeamMessageExt = Object.assign({}, ...present);
  return attachments.length > 0 ? { ...scalars, attachments } : scalars;
}

interface ActivityArtifactPayload {
  readonly tone?: T3TeamThreadActivityRecord["tone"];
  readonly summary?: string;
  readonly payload: unknown;
}

function isActivityArtifactPayload(value: unknown): value is ActivityArtifactPayload {
  return typeof value === "object" && value !== null && "payload" in value;
}

const activityByArtifact = new WeakMap<T3TeamThreadArtifact, T3TeamThreadActivityRecord | null>();

/**
 * The activity record of a fork activity artifact. The server upserts one artifact per step in
 * place, so its `updatedAt` is the time of the latest update — what the step views read as the
 * activity's instant.
 */
export function artifactThreadActivity(
  artifact: T3TeamThreadArtifact,
): T3TeamThreadActivityRecord | null {
  const cached = activityByArtifact.get(artifact);
  if (cached !== undefined) return cached;
  const payload = artifact.payload;
  const activity =
    artifact.kind.startsWith(ACTIVITY_KIND_PREFIX) && isActivityArtifactPayload(payload)
      ? {
          id: artifact.id,
          kind: artifact.kind,
          ...(payload.tone === undefined ? {} : { tone: payload.tone }),
          ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
          payload: payload.payload,
          createdAt: artifact.updatedAt,
        }
      : null;
  activityByArtifact.set(artifact, activity);
  return activity;
}
