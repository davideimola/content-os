import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A follower observation date, one way everywhere it is shown (#113). The YEAR is
// always there: the whole point of the observation key is that the number is only
// true on a stated date, and "25 Jul" stops being a date the moment a year turns.
const observedFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatObservedOn(iso: string): string {
  return observedFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00`));
}
