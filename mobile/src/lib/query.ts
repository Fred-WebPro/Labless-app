import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Treat "app came back to the foreground" as window focus, so stale data refreshes.
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
    return () => sub.remove();
  });
}
