import { useState } from "react";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import {
  isProjectRecipeWorkflowCardActivityPayload,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  type ProjectRecipeWorkflowCardActivityPayload,
} from "@t3tools/project-recipes";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { ChatMessage } from "~/types";

export { T3workMessageAttachmentList } from "./t3work-messageAttachmentList";

type WorkflowCardActionHandler =
  | ((input: {
      cardId: string;
      actionId: string;
      submit?: Record<string, unknown>;
    }) => Promise<void>)
  | undefined;

export function getT3workWorkflowCardAttachment(
  message: Pick<ChatMessage, "t3workExt">,
): ProjectRecipeWorkflowCardActivityPayload | null {
  for (const attachment of message.t3workExt?.attachments ?? []) {
    if (attachment.kind !== "view") {
      continue;
    }
    if (attachment.miniappId !== PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD) {
      continue;
    }
    if (isProjectRecipeWorkflowCardActivityPayload(attachment.props)) {
      return attachment.props;
    }
  }

  return null;
}

export function getT3workRenderableAttachments(
  message: Pick<ChatMessage, "t3workExt">,
): ReadonlyArray<import("@t3tools/contracts").T3workMessageAttachment> {
  return (message.t3workExt?.attachments ?? []).filter(
    (attachment) =>
      attachment.kind !== "view" ||
      attachment.miniappId !== PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  );
}

function renderWorkflowCardFields(workflowCard: ProjectRecipeWorkflowCardActivityPayload) {
  const card = workflowCard.card;
  if (!card.fields || card.fields.length === 0) {
    return null;
  }

  if (card.kind === "checklist") {
    return (
      <div className="mt-3 space-y-1.5">
        {card.fields.map((field, index) => {
          const label = typeof field.label === "string" ? field.label : `Item ${index + 1}`;
          const checked = field.checked === true;
          return (
            <div
              key={`${card.id}:field:${index}`}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              {checked ? (
                <CheckCircle2Icon className="size-4 text-emerald-600" />
              ) : (
                <div className="size-4 rounded-full border border-border/70" />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {card.fields.map((field, index) => (
        <div
          key={`${card.id}:field:${index}`}
          className="rounded-lg border border-border/55 bg-background/65 px-3 py-2 text-xs"
        >
          {Object.entries(field).map(([key, value]) => (
            <div
              key={`${card.id}:field:${index}:${key}`}
              className="flex items-start justify-between gap-2"
            >
              <span className="text-muted-foreground/70">{key}</span>
              <span className="max-w-[70%] text-right text-foreground/85">{String(value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function T3workWorkflowCardBody(props: {
  workflowCard: ProjectRecipeWorkflowCardActivityPayload;
  onSubmitRecipeCardAction?: WorkflowCardActionHandler;
}) {
  const { workflowCard, onSubmitRecipeCardAction } = props;
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);
  const card = workflowCard.card;
  const awaitingActionId = workflowCard.awaitingActionId;
  const completedActionId = workflowCard.completedActionId;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          {card.body ? (
            <p className="text-sm leading-6 text-muted-foreground">{card.body}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{card.kind}</Badge>
          <Badge variant="outline">
            {workflowCard.phase === "completed" ? "Completed" : "Open"}
          </Badge>
        </div>
      </div>

      {renderWorkflowCardFields(workflowCard)}

      {card.actions && card.actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.actions.map((action) => {
            const isAwaitedAction = awaitingActionId === action.id;
            const isCompletedAction = completedActionId === action.id;
            const isSubmitting = submittingActionId === action.id;
            const disabled =
              isCompletedAction || isSubmitting || !onSubmitRecipeCardAction || !isAwaitedAction;

            return (
              <Button
                key={`${card.id}:action:${action.id}`}
                type="button"
                size="sm"
                variant={
                  action.style === "secondary"
                    ? "outline"
                    : action.style === "danger"
                      ? "destructive"
                      : "default"
                }
                disabled={disabled}
                onClick={() => {
                  if (!onSubmitRecipeCardAction || !isAwaitedAction || disabled) {
                    return;
                  }

                  setSubmittingActionId(action.id);
                  void onSubmitRecipeCardAction({
                    cardId: card.id,
                    actionId: action.id,
                    ...(action.submit ? { submit: action.submit } : {}),
                  }).finally(() =>
                    setSubmittingActionId((current) => (current === action.id ? null : current)),
                  );
                }}
              >
                {isSubmitting ? <LoaderCircleIcon className="mr-1 size-3 animate-spin" /> : null}
                {isCompletedAction ? <CheckCircle2Icon className="mr-1 size-3" /> : null}
                {action.label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
