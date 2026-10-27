import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists, last-wins on conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Group a number for display: 1940 → "1,940". Every number in the UI is mono. */
export function fmt(n: number) {
  return n.toLocaleString("en-IN");
}

/** A percentage with one decimal, as the UI always writes it: 7.84 → "7.8%". */
export function pct(n: number, decimals = 1) {
  return `${n.toFixed(decimals)}%`;
}

/** Initials from a person's or company's name, at most two letters. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}
