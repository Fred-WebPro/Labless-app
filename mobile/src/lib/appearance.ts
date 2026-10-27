import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Appearance } from "react-native";

export type ThemePref = "system" | "light" | "dark";
const KEY = "labless.theme";
let current: ThemePref = "system";
const listeners = new Set<(p: ThemePref) => void>();

function apply(pref: ThemePref) {
  // "unspecified" hands the choice back to iOS; light/dark override it for this app only.
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

/** Restores the saved choice. Called once at startup, before the first screen draws. */
export async function loadThemePref() {
  try {
    const saved = (await AsyncStorage.getItem(KEY)) as ThemePref | null;
    if (saved === "light" || saved === "dark") {
      current = saved;
      apply(saved);
    }
  } catch {
    // Keep following the system.
  }
}

export async function setThemePref(pref: ThemePref) {
  current = pref;
  apply(pref);
  listeners.forEach((l) => l(pref));
  try {
    await AsyncStorage.setItem(KEY, pref);
  } catch {
    // Not saved; it still applies until the app restarts.
  }
}

export function useThemePref(): ThemePref {
  const [pref, setPref] = useState(current);
  useEffect(() => {
    listeners.add(setPref);
    return () => {
      listeners.delete(setPref);
    };
  }, []);
  return pref;
}
