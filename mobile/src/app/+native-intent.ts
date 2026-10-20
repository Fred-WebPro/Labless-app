/**
 * Files shared to Labless from other apps (WhatsApp, Mail, Files, Photos) arrive as an
 * `expo-sharing` link. Send them straight to the upload screen, which picks them up.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === "expo-sharing") return "/upload?shared=1";
    return path;
  } catch {
    return path || "/";
  }
}
