import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { T3TeamWorkflowCardBody } from "~/t3team/chat/t3team-messageExtViews";
import type { PendingT3TeamInlineWorkflowPrompt } from "~/t3team/t3team-inlineRecipeLaunchLocal";
import type { T3TeamInlineRecipeLaunchOutcome } from "~/t3team/t3team-inlineRecipeLaunch";

export function T3TeamInlineWorkflowPromptDialog(props: {
  readonly prompt: PendingT3TeamInlineWorkflowPrompt | null;
  readonly onResolve: (outcome: T3TeamInlineRecipeLaunchOutcome | null) => void;
}) {
  const { prompt, onResolve } = props;
  const [submitting, setSubmitting] = useState(false);
  if (!prompt) {
    return null;
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onResolve({ applied: false });
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader className="sr-only">
          <AlertDialogTitle>{prompt.title}</AlertDialogTitle>
          <AlertDialogDescription>{prompt.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 py-6">
          <T3TeamWorkflowCardBody
            workflowCard={prompt.workflowCard}
            onSubmitRecipeCardAction={async () => {
              setSubmitting(true);
              try {
                const outcome = await prompt.submitApprovedAction();
                setSubmitting(false);
                onResolve(outcome);
              } catch (error) {
                setSubmitting(false);
                throw error;
              }
            }}
          />
        </div>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onResolve({ applied: false })}
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
