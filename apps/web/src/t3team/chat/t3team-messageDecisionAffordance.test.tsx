// @vitest-environment jsdom
/**
 * The `askUser` decision card's `form` affordance, once answered (Epic 25 §askUser decision
 * cards). Choice/boolean affordances already show a settled state (the chosen option stays
 * highlighted, the rest mute); the form affordance never implemented one at all — the settled
 * card showed the form empty and disabled, with the submitted values gone. This covers the fix
 * in `t3team-messageDecisionAffordance.tsx` (the branch dispatch) and `t3team-messageDecisionForm.tsx`
 * (seeding the controls from the parsed answer).
 *
 * `answeredChoice` carries the reply's display text — the submitted struct's JSON when the SDK's
 * own resolution produced one, or arbitrary prose when the user typed in the composer instead of
 * using the form (the card's "…or reply in the composer below" escape hatch, see
 * `t3team-messageDecisionCard.tsx`). Both shapes, plus a value that parses but isn't a plain
 * object, must render without throwing — a crash here blanks the whole timeline row.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamWorkflowDecisionAffordance } from "~/t3team/chat/t3team-messageDecisionAffordance";

const FIELDS = [
  { name: "title", type: "string" as const, optional: false },
  { name: "severity", type: "literals" as const, options: ["low", "high"], optional: false },
  { name: "notify", type: "boolean" as const, optional: false },
  { name: "owner", type: "string" as const, optional: true },
];

function renderForm(answeredChoice: string | undefined) {
  const answered = answeredChoice !== undefined;
  return renderToStaticMarkup(
    <T3TeamWorkflowDecisionAffordance
      affordance={{ kind: "form", fields: FIELDS }}
      correlationId="run-1:1"
      submitting={null}
      locked={answered}
      formDisabled={answered}
      {...(answered ? { answeredChoice } : {})}
      onChoose={() => {}}
    />,
  );
}

describe("settled form affordance", () => {
  it("populates each control from a JSON struct answer, all read-only, no live Submit", () => {
    const markup = renderForm(
      JSON.stringify({
        title: "Rounding drift in cart totals",
        severity: "high",
        notify: true,
      }),
    );

    expect(markup).toContain("Rounding drift in cart totals");
    expect(markup).toContain('value="high"');
    // the boolean field renders as the shared `Switch` primitive, checked on, not a bare
    // checkbox and not the literal text "true".
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).not.toContain(">true<");
    expect(markup).not.toContain(">Submit<");
  });

  it("leaves a key the answer omits empty, not the literal 'undefined' or 'null'", () => {
    // `owner` (optional) is absent from the answer entirely.
    const markup = renderForm(JSON.stringify({ title: "x", severity: "low", notify: false }));

    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain(">null<");
    expect(markup).toContain('aria-checked="false"');
  });

  it("falls back to a summary line for a non-JSON prose answer, without throwing", () => {
    expect(() => renderForm("Actually lets just hold off on this one")).not.toThrow();
    const markup = renderForm("Actually lets just hold off on this one");

    expect(markup).toContain("Actually lets just hold off on this one");
    expect(markup).toContain('data-workflow-decision-status="answered-form-summary"');
    // no half-populated, silently-empty form sitting behind the prose.
    expect(markup).not.toContain('role="switch"');
  });

  it("falls back safely when the answer parses to something other than a plain object", () => {
    for (const nonObjectAnswer of ["42", '"just a string"', "[1,2,3]"]) {
      expect(() => renderForm(nonObjectAnswer)).not.toThrow();
      expect(renderForm(nonObjectAnswer)).toContain(
        'data-workflow-decision-status="answered-form-summary"',
      );
    }
  });

  it("renders an unanswered form unchanged: empty controls, an off switch, a live Submit", () => {
    const markup = renderForm(undefined);

    expect(markup).toContain(">Submit<");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
  });

  it("gives the switch an accessible name from the field's own label", () => {
    const markup = renderForm(undefined);

    expect(markup).toContain('aria-label="notify"');
  });
});
