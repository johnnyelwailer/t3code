/**
 * The `form` affordance of the `askUser` decision card (Epic 25 §askUser decision cards) — one
 * inline control per scalar field (text / number / toggle / select-for-literals) plus a submit.
 * The card owns the chrome and the freeform-composer escape hatch; this only collects the
 * structured value and hands it up. Built from the `form` affordance descriptor the SDK derives
 * from a flat scalar Struct schema; nested/non-scalar schemas never reach here (they render text).
 */
import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import type { ProjectRecipeWorkflowDecisionFormField as AskFormField } from "@t3tools/project-recipes";

import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";

const CONTROL_CLASS =
  "h-7.5 w-full rounded-md border border-border/70 bg-background px-2 text-sm text-foreground outline-none focus:border-primary/50";

/** Parses a settled form answer's display text back into the struct it submitted, when it is one.
 * `answeredChoice` is NOT guaranteed to be JSON — the card's composer escape hatch lets the user
 * type prose instead of using the form (see `t3team-messageDecisionCard.tsx`) — so a parse
 * failure, or a value that parses to something other than a plain object (a bare number, a
 * string, an array), is expected input rather than a bug. Both return null so the caller can fall
 * back to showing the raw text instead of crashing the whole timeline row. */
export function parseT3TeamDecisionFormAnswer(text: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Seeds the form's internal control values from a settled answer's parsed struct — the inverse of
 * `buildDecisionFormValue`. A key the answer doesn't contain (or holds `null`/`undefined` for) is
 * left unset so its control renders empty rather than the literal text "undefined"/"null". */
export function buildDecisionFormInitialValues(
  fields: ReadonlyArray<AskFormField>,
  answer: Record<string, unknown>,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = answer[field.name];
    if (raw === undefined || raw === null) {
      continue;
    }
    out[field.name] = field.type === "boolean" ? raw === true : String(raw);
  }
  return out;
}

/** Coerce the collected control values to the typed submission, omitting empty optional fields
 * (an empty required field is left absent so validation rejects it). */
export function buildDecisionFormValue(
  fields: ReadonlyArray<AskFormField>,
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.type === "boolean") {
      out[field.name] = raw === true;
      continue;
    }
    if (typeof raw !== "string" || raw.length === 0) {
      continue;
    }
    out[field.name] = field.type === "number" ? Number(raw) : raw;
  }
  return out;
}

/** Every scalar field except `boolean` — that one renders as a `Switch` in `FormFieldRow` instead,
 * since a toggle reads as a row beside its label rather than a column under it. */
function FieldControl(props: {
  field: AskFormField;
  value: string | boolean | undefined;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { field, value, disabled, onChange } = props;
  if (field.type === "literals") {
    return (
      <select
        className={CONTROL_CLASS}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      className={CONTROL_CLASS}
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** One field's row. A toggle reads as a row — label beside the control — unlike every other
 * field, which stacks the control under its label; branching layout here (rather than inside
 * `FieldControl`) keeps that the one place the two shapes diverge. */
function FormFieldRow(props: {
  field: AskFormField;
  value: string | boolean | undefined;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { field, value, disabled, onChange } = props;
  const label = (
    <span>
      {field.name}
      {field.optional ? null : <span className="text-primary"> *</span>}
    </span>
  );

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        <Switch
          aria-label={field.name}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <FieldControl field={field} value={value} disabled={disabled} onChange={onChange} />
    </label>
  );
}

export function T3TeamWorkflowDecisionForm(props: {
  fields: ReadonlyArray<AskFormField>;
  disabled: boolean;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
  /** The parsed struct of a settled answer. Seeds every control with what was actually submitted
   * and forces the whole form (including Submit, which is dropped rather than shown disabled —
   * there is nothing left to submit) into a read-only state; `disabled`/`submitting` no longer
   * matter once this is set, but stay harmless if also true. */
  answeredValues?: Record<string, unknown> | undefined;
}) {
  const { fields, disabled, submitting, onSubmit, answeredValues } = props;
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    answeredValues ? buildDecisionFormInitialValues(fields, answeredValues) : {},
  );
  const settled = answeredValues !== undefined;
  const locked = settled || disabled || submitting;

  return (
    <div className="mt-3 space-y-2.5">
      {fields.map((field) => (
        <FormFieldRow
          key={`field:${field.name}`}
          field={field}
          value={values[field.name]}
          disabled={locked}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
        />
      ))}
      {settled ? null : (
        <Button
          type="button"
          size="sm"
          disabled={locked}
          onClick={() => onSubmit(buildDecisionFormValue(fields, values))}
        >
          {submitting ? <LoaderCircleIcon className="mr-1 size-3 animate-spin" /> : null}
          Submit
        </Button>
      )}
    </div>
  );
}
