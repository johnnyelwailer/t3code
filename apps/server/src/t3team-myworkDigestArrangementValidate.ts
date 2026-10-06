/**
 * Write-side validation of a My Work arrangement. The wire schema
 * (`T3TeamMyWorkDigestPlan`, packages/contracts) is structural; what only the server knows is the
 * bundled widget list: a section may name only a bundled widget, in a placement that widget
 * allows, and the widget's content type must match the section's kind.
 */

import { T3TeamMyWorkDigestPlan, type T3TeamMyWorkDigestSection } from "@t3tools/contracts";
import { bundledDashboardWidget } from "@t3tools/t3team-skill-packs";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** The arrangement was rejected; `issues` says what to change, so an agent can fix and retry. */
class T3TeamMyWorkArrangementInvalidError extends Data.TaggedError(
  "T3TeamMyWorkArrangementInvalidError",
)<{ readonly issues: ReadonlyArray<string> }> {
  override get message(): string {
    return `Invalid My Work arrangement: ${this.issues.join(" ")}`;
  }
}

/** A section's widget: the named one, or the default for its kind (its bundled widget). */
const DEFAULT_WIDGET_BY_KIND = { items: "my-work.tickets", reviews: "my-work.reviews" } as const;

const sectionIssues = (section: T3TeamMyWorkDigestSection): ReadonlyArray<string> => {
  const widgetId = section.widget ?? DEFAULT_WIDGET_BY_KIND[section.kind];
  const widget = bundledDashboardWidget(widgetId);
  if (widget === undefined) {
    return [`Section '${section.id}': unknown widget '${widgetId}'.`];
  }
  const issues: string[] = [];
  if (!widget.placements.includes(section.placement)) {
    issues.push(
      `Section '${section.id}': widget '${widgetId}' cannot stand in '${section.placement}' ` +
        `(allowed: ${widget.placements.join(", ")}).`,
    );
  }
  const expectedContent = section.kind === "items" ? "tickets" : "reviews";
  if (widget.content !== expectedContent) {
    issues.push(
      `Section '${section.id}': widget '${widgetId}' lists ${widget.content}, ` +
        `but a '${section.kind}' section needs a widget that lists ${expectedContent}.`,
    );
  }
  if (section.kind === "items" && (section.reviewIds?.length ?? 0) > 0) {
    issues.push(`Section '${section.id}': an 'items' section takes no reviewIds.`);
  }
  if (section.kind === "reviews" && section.items.length > 0) {
    issues.push(`Section '${section.id}': a 'reviews' section lists reviewIds, not items.`);
  }
  return issues;
};

/** Cross-section rules that no single section can break on its own. */
const planIssues = (plan: T3TeamMyWorkDigestPlan): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const duplicates = plan.sections.filter((section) => {
    const duplicate = seen.has(section.id);
    seen.add(section.id);
    return duplicate;
  });
  return [
    ...(Option.isNone(DateTime.make(plan.producedAt))
      ? [`producedAt '${plan.producedAt}' is not an ISO timestamp.`]
      : []),
    ...duplicates.map((section) => `Section id '${section.id}' is used twice.`),
    ...plan.sections.flatMap(sectionIssues),
  ];
};

const decodePlan = Schema.decodeUnknownEffect(T3TeamMyWorkDigestPlan);

/** Decode an untrusted plan and apply the bundled-widget rules. */
export const validateDigestPlan = (input: unknown) =>
  decodePlan(input).pipe(
    Effect.mapError(
      (error) => new T3TeamMyWorkArrangementInvalidError({ issues: [error.message] }),
    ),
    Effect.flatMap((plan) => {
      const issues = planIssues(plan);
      return issues.length === 0
        ? Effect.succeed(plan)
        : Effect.fail(new T3TeamMyWorkArrangementInvalidError({ issues }));
    }),
  );
