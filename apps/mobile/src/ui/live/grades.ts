import type { Grade } from "@knockd/shared";

/** What each lead grade means, for the house sheet (see the README's lead grades). */
export const GRADE_OPTIONS: readonly { grade: Grade; text: string }[] = [
  { grade: "A", text: "Wants it now" },
  { grade: "B", text: "Wants it within a year" },
  { grade: "C", text: "No interest, but the number is useful" },
];
