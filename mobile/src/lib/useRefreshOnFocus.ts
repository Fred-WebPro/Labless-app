import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/** Refetches when a screen regains focus (skips the first focus, which already fetched). */
export function useRefreshOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
