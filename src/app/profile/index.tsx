import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Cake,
  ChevronRight,
  LogOut,
  ShieldCheck,
  User,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Design tokens (local, so this screen never breaks if Colors.ts      */
/* changes). Only Colors.successGreen is read from the shared palette. */
/* ------------------------------------------------------------------ */
const theme = {
  background: "#FAF8F5",
  surface: "#FFFFFF",
  ink: "#1F1612", // deep espresso
  inkSoft: "#6B5F57",
  inkMuted: "#A39990",
  gold: "#B08D57",
  goldTint: "#F5EEE2",
  hairline: "#ECE6DD",
  success: Colors?.successGreen || "#2E7D32",
  successTint: "#E8F3E9",
  danger: "#B42318",
  dangerTint: "#FDF1EF",
  dangerBorder: "#F3D3CE",
};

type ProfileData = {
  full_name?: string | null;
  system_role?: string | null;
  email?: string | null;
  [key: string]: any;
};

const getInitials = (name?: string | null) => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatRole = (role?: string | null) => {
  if (!role) return "Customer";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
};

export default function ProfileScreen() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // Keep latest router/toast in refs so the fetch runs once on mount
  // (prevents a refetch loop if showToast isn't memoized in the context).
  const routerRef = useRef(router);
  const toastRef = useRef(showToast);
  routerRef.current = router;
  toastRef.current = showToast;

  // Load authenticated profile row metadata
  useEffect(() => {
    let active = true;

    const fetchUserProfileData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          routerRef.current.replace("/(auth)/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!active) return;

        setProfile({
          full_name: "Valued Customer",
          system_role: "Customer",
          ...(data || {}),
          email: data?.email || user.email,
        });
        // Real verification state from Supabase Auth, not a hardcoded label
        setVerified(Boolean(user.email_confirmed_at));
      } catch (error: any) {
        toastRef.current(error?.message || "Failed to load user credentials.");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchUserProfileData();
    return () => {
      active = false;
    };
  }, []);

  // Execute the actual sign-out
  const performLogOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      showToast("Logged out successfully! Come back soon. 🎂");
      router.replace("/(auth)/login");
    } catch (error: any) {
      showToast(error?.message || "Could not log out. Please try again.");
      setSigningOut(false);
    }
  };

  // Confirm first; Alert buttons don't work on web, so fall back to confirm()
  const handleLogOut = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm("Log out of your account?")) {
        performLogOut();
      }
      return;
    }
    Alert.alert("Log out", "Are you sure you want to log out of your account?", [
      { text: "Stay signed in", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: performLogOut },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.gold} />
        <Text style={styles.loadingText}>Loading your profile…</Text>
      </View>
    );
  }

  const fullName = profile?.full_name || "Valued Customer";
  const initials = getInitials(profile?.full_name);
  const role = formatRole(profile?.system_role);
  const isStaff = role.toLowerCase() !== "customer";

  return (
    <ScrollView
      style={styles.mainContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. PROFILE SUMMARY CARD */}
      <View style={styles.profileCard}>
        <View style={styles.avatarRing}>
          <View style={styles.avatarCircle}>
            {initials ? (
              <Text style={styles.avatarInitials}>{initials}</Text>
            ) : (
              <User size={28} color={theme.gold} strokeWidth={1.75} />
            )}
          </View>
        </View>

        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {fullName}
          </Text>
          <Text style={styles.profileEmail} numberOfLines={1}>
            {profile?.email || "No email on file"}
          </Text>

          <View style={styles.pillRow}>
            {verified && (
              <View style={[styles.pill, styles.pillVerified]}>
                <ShieldCheck size={12} color={theme.success} strokeWidth={2.25} />
                <Text style={[styles.pillText, { color: theme.success }]}>
                  Verified Account
                </Text>
              </View>
            )}
            <View style={[styles.pill, isStaff ? styles.pillStaff : styles.pillRole]}>
              <Text
                style={[
                  styles.pillText,
                  { color: isStaff ? theme.danger : theme.gold },
                ]}
              >
                {role}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 2. CUSTOMER CARE LIST */}
      <Text style={styles.sectionTitle}>Customer care</Text>
      <View style={styles.listCard}>
        <MenuRow
          icon={<Cake size={18} color={theme.gold} strokeWidth={1.75} />}
          title="Active Cart Ledger"
          subtitle="Review orders and deposits"
          onPress={() => router.push("/(tabs)/cart")}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<AlertTriangle size={18} color={theme.gold} strokeWidth={1.75} />}
          title="File a Support Complaint"
          subtitle="Tell us what went wrong"
          onPress={() => router.push("/profile/file-complaint")}
        />
      </View>

      {/* 3. SESSION DISCONNECT */}
      <View style={styles.footerZone}>
        <Pressable
          onPress={handleLogOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.logoutPressed,
            signingOut && { opacity: 0.6 },
          ]}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={theme.danger} />
          ) : (
            <>
              <LogOut size={17} color={theme.danger} strokeWidth={1.9} />
              <Text style={styles.logoutText}>Log out</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.footerNote}>Vatican Cake Point</Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable menu row                                                   */
/* ------------------------------------------------------------------ */
function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      android_ripple={{ color: theme.goldTint }}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <View style={styles.iconTile}>{icon}</View>
      <View style={styles.menuTextWrap}>
        <Text style={styles.menuTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <ChevronRight size={18} color={theme.inkMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: theme.background },
  scrollContent: { padding: 20, paddingBottom: 48 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.background,
  },
  loadingText: {
    marginTop: 12,
    color: theme.inkSoft,
    fontSize: 14,
    letterSpacing: 0.2,
  },

  /* Profile card */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
    padding: 20,
    marginTop: 8,
    marginBottom: 32,
    shadowColor: "#2A1B10",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: theme.gold,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    color: theme.gold,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 1,
  },
  profileText: { flex: 1 },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: -0.2,
  },
  profileEmail: {
    fontSize: 13,
    color: theme.inkSoft,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillVerified: { backgroundColor: theme.successTint },
  pillRole: { backgroundColor: theme.goldTint },
  pillStaff: { backgroundColor: theme.dangerTint },
  pillText: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },

  /* Section */
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.ink,
    marginLeft: 4,
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  listCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.hairline,
    marginLeft: 68,
  },

  /* Menu rows */
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
  },
  menuRowPressed: { backgroundColor: theme.background },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: theme.goldTint,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuTextWrap: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: "600", color: theme.ink },
  menuSubtitle: { fontSize: 12.5, color: theme.inkSoft, marginTop: 2 },

  /* Footer / logout */
  footerZone: { marginTop: 40, alignItems: "center" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.dangerBorder,
    backgroundColor: "transparent",
  },
  logoutPressed: { backgroundColor: theme.dangerTint },
  logoutText: {
    color: theme.danger,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  footerNote: {
    marginTop: 20,
    fontSize: 12,
    color: theme.inkMuted,
    letterSpacing: 0.4,
  },
});