import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";

/** The wizard's step layout: title, one line of description, the body, then the actions. */
export function WelcomeStepShell({
  title,
  description,
  children,
  actions,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly actions: ReactNode;
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5 flex max-h-[min(32rem,55dvh)] min-h-0 flex-col overflow-y-auto">
        {children}
      </div>
      <div className="mt-6 flex justify-end gap-2">{actions}</div>
    </>
  );
}

export function WelcomeContinueButton({
  label = "Continue",
  disabled = false,
  onClick,
}: {
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button autoFocus disabled={disabled} onClick={onClick}>
      {label}
      <ArrowRightIcon className="size-3.5" />
    </Button>
  );
}
