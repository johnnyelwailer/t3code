/**
 * The `form` affordance of the `askUser` decision card (Epic 25 §askUser decision cards) — one
 * inline control per scalar field (text / number / checkbox / select-for-literals) plus a submit.
 * The card owns the chrome and the freeform-composer escape hatch; this only collects the
 * structured value and hands it up. Built from the `form` affordance descriptor the SDK derives
 * from a flat scalar Struct schema; nested/non-scalar schemas never reach here (they render text).
 */
import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import type { ProjectRecipeWorkflowDecisionFormField as AskFormField } from "@t3tools/project-recipes";

import { Button } from "~/components/ui/button";

const CONTROL_CLASS =
  "h-7.5 w-full rounded-md border border-border/70 bg-background px-2 text-sm text-foreground outline-none focus:border-primary/50";

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

function FieldControl(props: {
  field: AskFormField;
  value: string | boolean | undefined;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { field, value, disabled, onChange } = props;
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        className="size-4 self-start accent-primary"
        disabled={disabled}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
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

export function T3TeamWorkflowDecisionForm(props: {
  fields: ReadonlyArray<AskFormField>;
  disabled: boolean;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}) {
  const { fields, disabled, submitting, onSubmit } = props;
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const locked = disabled || submitting;

  return (
    <div className="mt-3 space-y-2.5">
      {fields.map((field) => (
        <label
          key={`field:${field.name}`}
          className="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          <span>
            {field.name}
            {field.optional ? null : <span className="text-primary"> *</span>}
          </span>
          <FieldControl
            field={field}
            value={values[field.name]}
            disabled={locked}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        </label>
      ))}
      <Button
        type="button"
        size="sm"
        disabled={locked}
        onClick={() => onSubmit(buildDecisionFormValue(fields, values))}
      >
        {submitting ? <LoaderCircleIcon className="mr-1 size-3 animate-spin" /> : null}
        Submit
      </Button>
    </div>
  );
}
