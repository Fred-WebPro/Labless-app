import { Alert, Platform } from "react-native";

/** Cross-platform destructive confirmation. Resolves true when the person confirms. */
export function confirm(opts: { title: string; message: string; confirm: string; cancel: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${opts.title}\n\n${opts.message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: opts.cancel, style: "cancel", onPress: () => resolve(false) },
      { text: opts.confirm, style: opts.destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
