import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Cake,
  ChevronRight,
  LogOut,
  FileText,
  Mail,
  MessageCircle,
  Package,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { SUPPORT } from "../../constants/support";
import { useAppToast } from "../../context/ToastContext";
import { realName } from "../../lib/displayName";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Design tokens, mapped from the shared palette in constants/Colors.ts */
/* ------------------------------------------------------------------ */
const theme = {
  background: Colors.background,
  surface: Colors.surface,
  ink: Colors.ink,
  inkSoft: Colors.inkSoft,
  inkMuted: Colors.inkMuted,
  gold: Colors.gold,
  goldTint: Colors.goldTint,
  hairline: Colors.hairline,
  success: Colors.successGreen,
  successTint: Colors.successTint,
  danger: Colors.danger,
  dangerTint: Colors.dangerTint,
  dangerBorder: Colors.dangerBorder,
};

const AVATAR_BUCKET = "avatars";

/** avatar_url stores the file path. Photos are private, so we show them through a temporary link. */
const signAvatar = async (value?: string | null): Promise<string | null> => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(value, 60 * 60);
  return data?.signedUrl ?? null;
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

// "System_Admin" -> "System Admin", "customer" -> "Customer"
const formatRole = (role?: string | null) => {
  if (!role) return "Customer";
  return role
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function ProfileScreen() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
          system_role: "Customer",
          ...(data || {}),
          // The profiles table has no email column: it lives with the sign-in
          email: user.email,
          // Fall back to the username chosen at sign-up if the row has none yet
          username: data?.username || user.user_metadata?.username || null,
        });
        // Real verification state from Supabase Auth, not a hardcoded label
        setVerified(Boolean(user.email_confirmed_at));

        const signed = await signAvatar(data?.avatar_url);
        if (active) setAvatarUrl(signed);
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

  /* ---------- contact support ---------- */
  const supportSignature = () => (profile?.username ? `My username is ${profile.username}.` : "");

  const openSupportEmail = async () => {
    const subject = encodeURIComponent("Vatican Cake Point support");
    const body = encodeURIComponent(`Hello,\n\n${supportSignature()}\n\nMy question:\n`);
    try {
      await Linking.openURL(`mailto:${SUPPORT.email}?subject=${subject}&body=${body}`);
    } catch {
      showToast(`No email app found. You can write to ${SUPPORT.email}`, { type: "info", duration: 12000 });
    }
  };

  const openSupportWhatsApp = async () => {
    const text = encodeURIComponent(`Hello Vatican Cake Point, I need help. ${supportSignature()}`.trim());
    try {
      // wa.me opens WhatsApp when it is installed, and WhatsApp Web in a browser when it is not
      await Linking.openURL(`https://wa.me/${SUPPORT.whatsapp}?text=${text}`);
    } catch {
      showToast(`Could not open WhatsApp. You can message ${SUPPORT.whatsappDisplay} directly.`, { type: "info", duration: 12000 });
    }
  };

  /* ---------- profile picture ---------- */
  const pickAndUploadAvatar = async () => {
    if (uploading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast("Allow photo access in your phone settings to choose a picture.", { type: "error" });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);

      // Shrink to a 512 px JPEG (about 50 KB) so uploads are fast and cheap
      const resized = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 512 } }], {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      const bytes = await (await fetch(resized.uri)).arrayBuffer();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      // Each user can only write inside their own folder (enforced by the database)
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { data: updated, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.id)
        .select("id");
      if (updateError || !updated?.length) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]); // do not leave an orphan file
        throw updateError ?? new Error("Could not save your picture. Please try again.");
      }

      // Tidy up the previous picture
      const previous = profile?.avatar_url as string | undefined;
      if (previous && !/^https?:\/\//i.test(previous) && previous !== path) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
      }

      setProfile((p) => ({ ...(p || {}), avatar_url: path }));
      setAvatarUrl(await signAvatar(path));
      showToast("Profile picture updated.", { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not upload your picture. Please try again.", { type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      const previous = profile?.avatar_url as string | undefined;
      const { data: updated, error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id).select("id");
      if (error || !updated?.length) throw error ?? new Error("Could not remove your picture.");

      if (previous && !/^https?:\/\//i.test(previous)) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
      setProfile((p) => ({ ...(p || {}), avatar_url: null }));
      setAvatarUrl(null);
      showToast("Profile picture removed.", { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not remove your picture.", { type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const openAvatarMenu = () => {
    if (uploading) return;
    // Alert buttons do not work on web, where tapping goes straight to the picker
    if (Platform.OS === "web" || !avatarUrl) {
      pickAndUploadAvatar();
      return;
    }
    Alert.alert("Profile picture", undefined, [
      { text: "Choose a new photo", onPress: pickAndUploadAvatar },
      { text: "Remove photo", style: "destructive", onPress: removeAvatar },
      { text: "Cancel", style: "cancel" },
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

  const username: string | null = profile?.username || null;
  // A real name if they gave one (placeholders like "Valued Customer" do not count), otherwise their username
  const fullName = realName(profile?.full_name);
  const displayName = fullName || username || "Customer";
  const handle = fullName && username ? `@${username}` : "";
  const initials = getInitials(fullName || username);
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
        <Pressable
          onPress={openAvatarMenu}
          disabled={uploading}
          style={styles.avatarWrap}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          <View style={styles.avatarRing}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" transition={150} />
            ) : (
              <View style={styles.avatarCircle}>
                {initials ? (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                ) : (
                  <User size={28} color={theme.gold} strokeWidth={1.75} />
                )}
              </View>
            )}
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}
          </View>
          <View style={styles.cameraBadge}>
            <Camera size={13} color={theme.gold} strokeWidth={2} />
          </View>
        </Pressable>

        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
          {!!handle && (
            <Text style={styles.profileHandle} numberOfLines={1}>
              {handle}
            </Text>
          )}
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
          icon={<Package size={18} color={theme.gold} strokeWidth={1.75} />}
          title="My Orders"
          subtitle="Track progress and pay balances"
          onPress={() => router.push("/(tabs)/orders")}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<BarChart3 size={18} color={theme.gold} strokeWidth={1.75} />}
          title="My Analytics"
          subtitle="Spending, flavors and upcoming events"
          onPress={() => router.push("/profile/analytics")}
        />
      </View>

      {/* HELP AND SUPPORT */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Help and support</Text>
      <View style={styles.listCard}>
        <MenuRow
          icon={<AlertTriangle size={18} color={theme.gold} strokeWidth={1.75} />}
          title="File a Support Complaint"
          subtitle="Tell us what went wrong"
          onPress={() => router.push("/profile/file-complaint")}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<Mail size={18} color={theme.gold} strokeWidth={1.75} />}
          title="Email support"
          subtitle={SUPPORT.email}
          onPress={openSupportEmail}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<MessageCircle size={18} color={theme.gold} strokeWidth={1.75} />}
          title="Chat on WhatsApp"
          subtitle={SUPPORT.whatsappDisplay}
          onPress={openSupportWhatsApp}
        />
      </View>

      {/* PRIVACY AND ACCOUNT */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Privacy and account</Text>
      <View style={styles.listCard}>
        <MenuRow
          icon={<FileText size={18} color={theme.gold} strokeWidth={1.75} />}
          title="Privacy Policy"
          subtitle="How we use your information"
          onPress={() => router.push("/legal/privacy")}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<FileText size={18} color={theme.gold} strokeWidth={1.75} />}
          title="Terms of Service"
          subtitle="The rules for ordering"
          onPress={() => router.push("/legal/terms")}
        />
        <View style={styles.separator} />
        <MenuRow
          icon={<Trash2 size={18} color={theme.danger} strokeWidth={1.75} />}
          title="Delete account"
          subtitle="Permanently remove your account"
          danger
          onPress={() => router.push("/profile/delete-account")}
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
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
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
        <Text style={[styles.menuTitle, danger && { color: theme.danger }]}>{title}</Text>
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
  },
  avatarWrap: { marginRight: 16 },
  avatarImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.goldTint },
  avatarOverlay: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(20,12,8,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.ink,
    borderWidth: 2,
    borderColor: theme.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  profileHandle: { fontSize: 14, fontWeight: "600", color: theme.gold, marginTop: 2 },
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