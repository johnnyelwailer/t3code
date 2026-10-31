import { CheckIcon } from "lucide-react";
import type { Ref } from "react";

import { Button } from "~/components/ui/button";

/** The front card's explicit action: choose, or toggle a pick in a multiple choice. */
export function T3TeamRichChoiceAction({
  ref,
  label,
  multiple,
  picked,
  onClick,
}: {
  readonly ref: Ref<HTMLButtonElement>;
  readonly label: string;
  readonly multiple: boolean;
  readonly picked: boolean;
  readonly onClick: () => void;
}) {
  const added = multiple && picked;
  return (
    <Button
      ref={ref}
      data-rc-action=""
      className="w-full sm:w-auto"
      variant={added ? "outline" : "default"}
      aria-pressed={multiple ? picked : undefined}
      onClick={onClick}
    >
      {added ? (
        <>
          <CheckIcon className="size-4" aria-hidden />
          Added
        </>
      ) : (
        label
      )}
    </Button>
  );
}
