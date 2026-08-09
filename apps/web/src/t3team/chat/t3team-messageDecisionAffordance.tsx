/**
 * The answer controls of an `askUser` card — the part the user actually acts on.
 *
 * Split out of `t3team-messageDecisionCard` so the card stays "question, controls, where to reply"
 * and every affordance kind reaches the one submit path. A schema-backed ask (choice/boolean) gets
 * real buttons here; a `text` ask renders nothing, which is exactly why the card's pointer to the
 * composer has to be loud.
 */

import { LoaderCircleIcon } from "lucide-react";
import type { ProjectRecipeWorkflowDecisionPayload } from "@t3tools/project-recipes";

import { Button } from "~/components/ui/button";

import { T3TeamWorkflowDecisionForm } from "./t3team-messageDecisionForm";

type Affordance = ProjectRecipeWorkflowDecisionPayload["affordance"];

/** A summary of a form submission for the reply message's display text. */
export function summarizeT3TeamDecisionFormValue(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  return entries.length === 0
    ? "Submitted"
    : entries.map(([key, fieldValue]) => `${key}: ${String(fieldValue)}`).join(", ");
}

function DecisionButton(props: {
  label: string;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={props.primary ? "default" : "outline"}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.busy ? <LoaderCircleIcon className="mr-1 size-3 animate-spin" /> : null}
      {props.label}
    </Button>
  );
}

export function T3TeamWorkflowDecisionAffordance({
  affordance,
  correlationId,
  submitting,
  locked,
  formDisabled,
  onChoose,
}: {
  readonly affordance: Affordance;
  readonly correlationId: string;
  readonly submitting: string | null;
  readonly locked: boolean;
  readonly formDisabled: boolean;
  readonly onChoose: (choice: string, value: unknown) => void;
}) {
  if (affordance.kind === "choice") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {affordance.options.map((option) => (
          <DecisionButton
            key={`choice:${correlationId}:${option}`}
            label={option}
            busy={submitting === option}
            disabled={locked}
            onClick={() =>
              onChoose(option, affordance.field === undefined ? option : { [affordance.field]: option })
            }
          />
        ))}
      </div>
    );
  }

  if (affordance.kind === "boolean") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {([true, false] as const).map((bool) => {
          const label = bool
            ? (affordance.labels?.true ?? "Yes")
            : (affordance.labels?.false ?? "No");
          return (
            <DecisionButton
              key={`boolean:${correlationId}:${String(bool)}`}
              label={label}
              busy={submitting === label}
              disabled={locked}
              primary={bool}
              onClick={() => onChoose(label, bool)}
            />
          );
        })}
      </div>
    );
  }

  if (affordance.kind === "form") {
    return (
      <T3TeamWorkflowDecisionForm
        fields={affordance.fields}
        disabled={formDisabled}
        submitting={submitting !== null}
        onSubmit={(value) => onChoose(summarizeT3TeamDecisionFormValue(value), value)}
      />
    );
  }

  return null;
}
