/**
 * Light / dark mode. Follows the computer's setting unless the person picks one (remembered in
 * this browser). Sets <html data-theme="light|dark"> when overridden, which styles.css reads.
 */
import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "knockd-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let pref: ThemePref = readPref();
let snapshot = compute();

function compute() {
  const theme: Theme = pref === "system" ? (media.matches ? "dark" : "light") : pref;
  return { pref, theme };
}

function apply() {
  snapshot = compute();
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  listeners.forEach((l) => l());
}

media.addEventListener("change", apply);
apply();

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // private window or blocked storage: still switch for this visit
  }
  apply();
}

/** { pref, theme }: the person's choice, and the theme actually shown. */
export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
