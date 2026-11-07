import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";
import { ToastProvider } from "../context/ToastContext";

const ADMIN_ROLES = ["System_Admin", "Staff_Admin"];

// Shared header look for the screens that use a native header (profile pages)
const brandedHeader = {
  headerShown: true,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.ink,
  headerTitleStyle: { fontWeight: "700" as const, color: Colors.ink },
};

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Remember WHICH user the role belongs to, so a stale role is never used
  const [role, setRole] = useState<{ userId: string; value: string } | null>(null);

  /* ---------- 1. session ---------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session);
      })
      .catch(() => {
        /* treat as signed out */
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    // Keep this callback synchronous: calling supabase (or awaiting) inside
    // onAuthStateChange can deadlock the auth client. Role loading happens in
    // its own effect below instead.
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

  /* ---------- 2. role (re-fetched only when the user changes) ---------- */
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }

    let cancelled = false;
    (async () => {
      let value = "Customer";
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("system_role")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;
        value = data?.system_role || "Customer";
      } catch {
        // Fall back to Customer. This only affects routing; real access
        // control must be enforced by Supabase RLS.
      }
      if (!cancelled) setRole({ userId, value });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Still working out who the user is and what they may see
  const loading = !authReady || (!!userId && role?.userId !== userId);
  const userRole = role?.value ?? null;

  /* ---------- 3. redirect guard ---------- */
  useEffect(() => {
    if (loading) return;

    const segs = segments as string[];
    const inAuthGroup = segs.includes("(auth)");
    const inAdminGroup = segs.includes("(admin)");

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    if (userRole && ADMIN_ROLES.includes(userRole)) {
      if (!inAdminGroup) router.replace("/(admin)");
    } else if (inAuthGroup || inAdminGroup) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userRole, segments, loading]);

  return (
    <ToastProvider>
      <StatusBar style="dark" />

      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(admin)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/index" options={{ ...brandedHeader, title: "My profile" }} />
        <Stack.Screen name="profile/file-complaint" options={{ ...brandedHeader, title: "Support complaint" }} />
        <Stack.Screen name="profile/analytics" options={{ ...brandedHeader, title: "My analytics" }} />
        <Stack.Screen name="receipt" options={{ ...brandedHeader, title: "Receipt" }} />
        <Stack.Screen name="nova" options={{ ...brandedHeader, title: "Nova" }} />
      </Stack>

      {/* Covers the app until we know who is signed in, so nobody sees a
          flash of the wrong screen (or fires queries before auth is ready). */}
      {loading && (
        <View style={styles.splash} pointerEvents="auto">
          <Text style={styles.splashBrand}>Vatican Cake Point</Text>
          <ActivityIndicator size="small" color={Colors.gold} style={{ marginTop: 16 }} />
        </View>
      )}
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  splashBrand: { fontSize: 24, fontWeight: "700", color: Colors.ink, letterSpacing: -0.3 },
});