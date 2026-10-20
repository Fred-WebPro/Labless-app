import { Caveat_700Bold } from "@expo-google-fonts/caveat";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, router, usePathname, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components/Toast";
import { I18nProvider, useI18n } from "@/i18n";
import { ping, track, trackScreen } from "@/lib/analytics";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useMembers, useProfile } from "@/lib/data";
import { registerPush } from "@/lib/push";
import { queryClient } from "@/lib/query";
import { SelectedMemberProvider } from "@/lib/selected";
import { hasPendingShare } from "@/lib/share";
import { openTarget } from "@/lib/notify";
import { syncSleep } from "@/lib/sleep";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { Button, T } from "@/components/ui";

SplashScreen.preventAutoHideAsync().catch(() => {});

const PUBLIC = new Set(["welcome", "sign-in", "sign-up", "forgot", "legal"]);

function Gate() {
  const { session, loading } = useAuth();
  const { ready: i18nReady, locale } = useI18n();
  const profile = useProfile();
  const members = useMembers();
  const segments = useSegments();
  const pathname = usePathname();
  const first = segments[0] as string | undefined;

  const dataReady = !session || (profile.isFetched && members.isFetched);
  const ready = !loading && i18nReady && dataReady;
  const needsOnboarding = !!session && dataReady && (!profile.data?.onboarded || !members.data?.some((m) => m.is_self));

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    if (!session) {
      if (!first || !PUBLIC.has(first)) router.replace("/welcome");
    } else if (needsOnboarding) {
      if (first !== "onboarding" && first !== "member") router.replace("/onboarding");
    } else if (!first || (PUBLIC.has(first) && first !== "legal") || first === "onboarding") {
      router.replace("/");
      // A file shared before signing in is still waiting: continue straight to the upload.
      if (hasPendingShare()) setTimeout(() => router.push("/upload?shared=1"), 300);
    }
  }, [ready, session, needsOnboarding, first]);

  // Analytics: app opens and screen views.
  const opened = useRef(false);
  useEffect(() => {
    if (!session) {
      opened.current = false;
      return;
    }
    if (!opened.current) {
      opened.current = true;
      ping(locale);
      syncSleep();
      if (profile.data?.notifications_enabled !== false) registerPush(false);
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      ping(locale);
      syncSleep();
    });
    return () => sub.remove();
  }, [session, locale, profile.data?.notifications_enabled]);

  useEffect(() => {
    if (session && pathname) trackScreen(pathname);
  }, [pathname, session]);

  // Opening a push notification goes to the screen or link it points at,
  // also when the notification is what launched the app.
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web" || !lastResponse || !ready || !session || needsOnboarding) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = lastResponse.notification.request.content.data as { route?: string; url?: string; broadcastId?: string } | undefined;
    track("push_opened", { broadcast_id: data?.broadcastId ?? null, route: data?.route ?? null });
    setTimeout(() => openTarget(data), 250);
  }, [lastResponse, ready, session, needsOnboarding]);

  if (session && profile.data?.banned_at) {
    return <Blocked />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: "default" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="upload" options={{ presentation: "modal" }} />
        <Stack.Screen name="member/edit" options={{ presentation: "modal" }} />
        <Stack.Screen name="legal" options={{ presentation: "modal" }} />
      </Stack>
      {!ready ? <View style={{ position: "absolute", inset: 0, backgroundColor: colors.paper }} /> : null}
    </View>
  );
}

function Blocked() {
  const { t } = useI18n();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: "center", padding: 28, gap: 14 }}>
      <T v="title">{t.blocked.title}</T>
      <T v="body">{t.blocked.body}</T>
      <Button label={t.blocked.signOut} kind="ink" onPress={() => supabase.auth.signOut()} style={{ marginTop: 10 }} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Caveat_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <AuthProvider>
              <SelectedMemberProvider>
                <ToastProvider>
                  <StatusBar style="auto" />
                  <Gate />
                </ToastProvider>
              </SelectedMemberProvider>
            </AuthProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
