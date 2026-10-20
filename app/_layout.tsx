import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import "react-native-reanimated";

import { AppThemeProvider, useAppTheme } from "@/components/theme";
import { loadAll } from "@/lib/api";
import { cancelAllGameReminders } from "@/lib/notifications";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

// Supabase's token auto-refresh only runs while this fires; without it,
// a backgrounded app's session silently expires instead of refreshing.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase?.auth.startAutoRefresh();
    // Also rolls the demo feed forward when the app is reopened on a new day.
    if (useAppStore.getState().isAuthed) loadAll().catch(() => {});
  } else {
    supabase?.auth.stopAutoRefresh();
  }
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
  });

  // Demo mode has no session to check: the persisted isAuthed flag stands.
  const [sessionChecked, setSessionChecked] = useState(!supabase);
  // The Zustand store's AsyncStorage rehydration is async - gate the first
  // render on it so RootNav never routes on the in-memory defaults.
  const storeHydrated = useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => true
  );

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) await loadAll().catch(() => {});
      useAppStore.getState().patch({ isAuthed: !!session });
      setSessionChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        // Load before flipping isAuthed so routing sees the real onboarded flag.
        loadAll()
          .catch(() => {})
          .finally(() => useAppStore.getState().patch({ isAuthed: true }));
      } else if (event === "SIGNED_OUT") {
        // Don't leave the last account's games, profile or reminders on the
        // device for whoever signs in next. reset() also clears isAuthed.
        cancelAllGameReminders();
        useAppStore.getState().reset();
      } else if (!session) {
        useAppStore.getState().patch({ isAuthed: false });
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (storeHydrated && !supabase && useAppStore.getState().isAuthed) loadAll();
  }, [storeHydrated]);

  useEffect(() => {
    if (loaded && sessionChecked && storeHydrated) SplashScreen.hideAsync();
  }, [loaded, sessionChecked, storeHydrated]);

  if (!loaded || !sessionChecked || !storeHydrated) return null;

  return (
    <AppThemeProvider>
      <RootNav />
    </AppThemeProvider>
  );
}

const sheet = (detents: number[]) => ({
  presentation: "formSheet" as const,
  sheetAllowedDetents: detents,
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
});

function RootNav() {
  const { colors } = useAppTheme();
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  const isAuthed = useAppStore((s) => s.isAuthed);

  return (
    <>
      {/* Every screen opens on the solid blue header. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "default",
        }}
      >
        <Stack.Protected guard={!isAuthed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthed && !hasOnboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthed && hasOnboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="post-game" options={{ presentation: "modal" }} />
          <Stack.Screen name="attendance/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="user/[id]" options={sheet([0.6, 1])} />
          <Stack.Screen name="profile-edit" options={{ presentation: "modal" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
