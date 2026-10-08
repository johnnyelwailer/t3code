import { Search, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";

/** The one search box of a picker: icon, input and a clear button once there is text. */
export function PickerSearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        autoFocus
        size="lg"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Clear search"
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
