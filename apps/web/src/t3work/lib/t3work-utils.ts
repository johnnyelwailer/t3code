import { type ClassValue, clsx } from "clsx";
import { randomUUID as sharedRandomUUID } from "~/lib/utils";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function randomUUID(): string {
  return sharedRandomUUID();
}
