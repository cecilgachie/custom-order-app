import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";
import { ToastProvider, useAppToast } from "../context/ToastContext";

const ADMIN_ROLES = ["System_Admin", "Staff_Admin"];

// The logo's own background pink, so the launch screen and the app's loading cover look identical
const SPLASH_BG = "#FFE7E7";
const BRAND_RED = "#AE0012";

// Keep the native launch screen up until we know who is signed in (hidden below)
SplashScreen.preventAutoHideAsync().catch(() => {});
(SplashScreen as any).setOptions?.({ duration: 400, fade: true });

// Shared header look for the screens that use a native header
const brandedHeader = {
  headerShown: true,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.ink,
  headerTitleStyle: { fontWeight: "700" as const, color: Colors.ink },
};

/**
 * Expo Router shows this instead of a white screen if any screen crashes.
 * (Add error reporting here, e.g. Sentry, before launch.)
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={styles.fullCenter}>
      <Text style={styles.brand}>Vatican Cake Point</Text>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>Please try again. If it keeps happening, restart the app.</Text>
      {__DEV__ && <Text style={styles.devError}>{error.message}</Text>}
      <Pressable onPress={retry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  // The toast provider wraps the navigator so the guard below can show messages too
  return (
    <ToastProvider>
      <RootNavigator />
    </ToastProvider>
  );
}

function RootNavigator() {
  const segments = useSegments();
  const router = useRouter();
  const { showToast } = useAppToast();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Remember WHICH user the role belongs to, so a stale role is never used
  const [role, setRole] = useState<{ userId: string; value: string; suspended: boolean } | null>(null);

  /* ---------- 1. session ---------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) setSession(session);
      })
      .catch(() => {
        /* treat as signed out */
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    // Keep this callback synchronous: calling supabase (or awaiting) inside
    // onAuthStateChange can deadlock the auth client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ---------- 2. role + suspension (re-fetched only when the user changes) ---------- */
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }

    let cancelled = false;
    (async () => {
      let value = "Customer";
      let suspended = false;
      try {
        // "*" so this keeps working whether or not the suspension columns exist
        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        if (error) throw error;
        value = data?.system_role || "Customer";
        suspended = Boolean(data?.is_suspended);
      } catch {
        // Fall back to Customer. This only affects routing; real access
        // control is enforced by Supabase RLS.
      }
      if (!cancelled) setRole({ userId, value, suspended });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Still working out who the user is and what they may see
  const loading = !authReady || (!!userId && role?.userId !== userId);
  const userRole = role?.value ?? null;

  // Reveal the app once we know who is signed in
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Safety net: never leave the launch screen up forever if the network hangs
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000);
    return () => clearTimeout(t);
  }, []);

  /* ---------- 3. suspended customers are signed out ---------- */
  useEffect(() => {
    if (!role?.suspended || ADMIN_ROLES.includes(role.value)) return;
    showToast("Your account has been suspended. Please contact support.", { type: "error", duration: 12000 });
    supabase.auth.signOut({ scope: "local" });
  }, [role, showToast]);

  /* ---------- 4. redirect guard ---------- */
  useEffect(() => {
    if (loading) return;

    const segs = segments as string[];
    const inAuthGroup = segs.includes("(auth)");
    const inAdminGroup = segs.includes("(admin)");
    // Privacy Policy and Terms must be readable before signing up, and by everyone
    // The email-link page must also stay open while the link signs the person in
    const inPublic = segs[0] === "legal" || segs[0] === "auth-callback";

    if (!session) {
      if (!inAuthGroup && !inPublic) router.replace("/(auth)/login");
      return;
    }

    if (userRole && ADMIN_ROLES.includes(userRole)) {
      if (!inAdminGroup && !inPublic) router.replace("/(admin)");
    } else if (inAuthGroup || inAdminGroup) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userRole, segments, loading]);

  return (
    <>
      <StatusBar style="dark" />

      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(admin)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/index" options={{ ...brandedHeader, title: "My profile" }} />
        <Stack.Screen name="profile/file-complaint" options={{ ...brandedHeader, title: "Support complaint" }} />
        <Stack.Screen name="profile/analytics" options={{ ...brandedHeader, title: "My analytics" }} />
        <Stack.Screen name="profile/delete-account" options={{ ...brandedHeader, title: "Delete account" }} />
        <Stack.Screen name="legal/privacy" options={{ ...brandedHeader, title: "Privacy Policy" }} />
        <Stack.Screen name="legal/terms" options={{ ...brandedHeader, title: "Terms of Service" }} />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="receipt" options={{ ...brandedHeader, title: "Receipt" }} />
        <Stack.Screen name="nova" options={{ ...brandedHeader, title: "Nova" }} />
      </Stack>

      {/* Covers the app until we know who is signed in, so nobody sees a
          flash of the wrong screen (or fires queries before auth is ready). */}
      {loading && (
        <View style={styles.splash} pointerEvents="auto">
          <Image source={require("../../assets/images/splash-icon.png")} style={styles.splashLogo} resizeMode="contain" accessibilityLabel="Vatican Cake Point" />
          <ActivityIndicator size="small" color={BRAND_RED} style={{ marginTop: 8 }} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  splashLogo: { width: 260, height: 260 },
  splashBrand: { fontSize: 24, fontWeight: "700", color: Colors.ink, letterSpacing: -0.3 },

  fullCenter: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: Colors.background },
  brand: { fontSize: 13, fontWeight: "700", letterSpacing: 1.6, color: Colors.gold, textTransform: "uppercase" },
  errorTitle: { fontSize: 24, fontWeight: "800", color: Colors.ink, marginTop: 12, letterSpacing: -0.4 },
  errorText: { fontSize: 15, color: Colors.inkSoft, textAlign: "center", marginTop: 8, lineHeight: 22 },
  devError: { fontSize: 12, color: Colors.danger, marginTop: 14, textAlign: "center" },
  retryBtn: { marginTop: 24, height: 50, paddingHorizontal: 28, borderRadius: 16, backgroundColor: Colors.ink, justifyContent: "center" },
  retryText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});