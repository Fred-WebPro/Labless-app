import * as Sharing from "expo-sharing";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { pagesFromShare, type Page } from "@/lib/upload";

/** Receiving shares needs the native share extension, which Expo Go and the web build don't have. */
function receivingSupported(): boolean {
  if (Platform.OS === "web") return false;
  try {
    Sharing.getSharedPayloads();
    return true;
  } catch {
    return false;
  }
}

export function hasPendingShare(): boolean {
  if (!receivingSupported()) return false;
  try {
    return Sharing.getSharedPayloads().length > 0;
  } catch {
    return false;
  }
}

/**
 * Calls `onFiles` with pages for every photo or PDF shared to Labless from another app,
 * now and whenever the app comes back to the foreground. `onUnsupported` fires when only
 * other kinds of content were shared.
 */
export function useSharedFiles(onFiles: (pages: Page[]) => void, onUnsupported: () => void) {
  const handlers = useRef({ onFiles, onUnsupported });
  useEffect(() => {
    handlers.current = { onFiles, onUnsupported };
  });

  useEffect(() => {
    if (!receivingSupported()) return;
    let busy = false;
    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!Sharing.getSharedPayloads().length) return;
        const resolved = await Sharing.getResolvedSharedPayloadsAsync();
        Sharing.clearSharedPayloads();
        const pages = pagesFromShare(resolved);
        if (pages.length) handlers.current.onFiles(pages);
        else handlers.current.onUnsupported();
      } catch {
        handlers.current.onUnsupported();
      } finally {
        busy = false;
      }
    };
    pull();
    const sub = AppState.addEventListener("change", (s) => s === "active" && pull());
    return () => sub.remove();
  }, []);
}
