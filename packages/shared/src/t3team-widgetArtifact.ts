/**
 * Reads a rich-choice widget out of a `widget` thread artifact (payload JSON in `widget.html`);
 * mobile renders these natively, the web reads the same artifacts through its message-ext reader.
 */
import { T3TeamMessageWidgetAttachment, type T3TeamThreadArtifact } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodeWidget = Schema.decodeUnknownOption(T3TeamMessageWidgetAttachment);

export interface RichChoiceArtifactWidget {
  readonly widgetId: string;
  readonly title: string;
  /** The rich-choice payload JSON; validate it with `parseRichChoicePayload`. */
  readonly html: string;
  readonly createdAt: string;
}

export function readRichChoiceArtifactWidget(
  artifact: Pick<T3TeamThreadArtifact, "kind" | "payload" | "createdAt">,
): RichChoiceArtifactWidget | null {
  if (artifact.kind !== "widget") return null;
  const decoded = decodeWidget(artifact.payload);
  if (Option.isNone(decoded)) return null;
  const { widget } = decoded.value;
  if (widget.format !== "rich-choice") return null;
  return {
    widgetId: widget.widgetId,
    title: widget.title,
    html: widget.html,
    createdAt: artifact.createdAt,
  };
}
