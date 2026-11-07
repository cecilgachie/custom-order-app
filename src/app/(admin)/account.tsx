import { useFocusEffect } from "expo-router";
import { Eye, EyeOff, KeyRound, LogOut, Mail, ShieldCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

const MIN_PASSWORD = 8;

const getInitials = (name?: string | null, email?: string | null) => {
  const source = (name || email || "").trim();
  if (!source) return "";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// "Staff_Admin" -> "Staff Admin"
const formatRole = (role?: string | null) =>
  (role || "Staff").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminAccountScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Change password
  const [showForm, setShowForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // the root guard sends signed-out users to login

      setEmail(user.email ?? null);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setName(data?.full_name ?? null);
      setRole(data?.system_role ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* ---------- log out ---------- */
  const performSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // "local" ends this device's session only (the default would also sign out other devices)
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      // The root layout guard now sends the user to the login screen
    } catch (e: any) {
      showToast(e?.message || "Could not log out. Please try again.", { type: "error" });
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm("Log out of the admin account?")) performSignOut();
      return;
    }
    Alert.alert("Log out", "Are you sure you want to log out of the admin account?", [
      { text: "Stay signed in", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: performSignOut },
    ]);
  };

  /* ---------- change password ---------- */
  const resetForm = () => {
    setNewPassword("");
    setConfirmPassword("");
    setPwError(null);
    setShowPassword(false);
  };

  const changePassword = async () => {
    if (savingPassword) return;
    if (newPassword.length < MIN_PASSWORD) return setPwError(`Use at least ${MIN_PASSWORD} characters.`);
    if (newPassword !== confirmPassword) return setPwError("The two passwords do not match.");

    setPwError(null);
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast("Password updated.", { type: "success" });
      resetForm();
      setShowForm(false);
    } catch (e: any) {
      setPwError(e?.message || "Could not update your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const initials = getInitials(name, email);
  const roleLabel = formatRole(role);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Account</Text>

        {/* Identity */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "A"}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name || "Admin"}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {email || "No email"}
            </Text>
            <View style={styles.rolePill}>
              <ShieldCheck size={12} color="#8A6A33" strokeWidth={2.25} />
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* Details */}
        <Text style={styles.sectionTitle}>Sign-in details</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <View style={styles.iconTile}>
              <Mail size={17} color={Colors.gold} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {email || "Not set"}
              </Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.detailRow}>
            <View style={styles.iconTile}>
              <ShieldCheck size={17} color={Colors.gold} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Access level</Text>
              <Text style={styles.detailValue}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* Security */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => {
              if (showForm) resetForm();
              setShowForm((v) => !v);
            }}
            style={({ pressed }) => [styles.detailRow, pressed && { backgroundColor: Colors.background }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: showForm }}
          >
            <View style={styles.iconTile}>
              <KeyRound size={17} color={Colors.gold} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailValue}>Change password</Text>
              <Text style={styles.detailLabel}>Choose a new password for this account</Text>
            </View>
          </Pressable>

          {showForm && (
            <View style={styles.form}>
              <View style={styles.field}>
                <TextInput
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    if (pwError) setPwError(null);
                  }}
                  placeholder="New password"
                  placeholderTextColor={Colors.inkMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  style={styles.input}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={19} color={Colors.inkMuted} /> : <Eye size={19} color={Colors.inkMuted} />}
                </Pressable>
              </View>
              <View style={styles.field}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (pwError) setPwError(null);
                  }}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.inkMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.input}
                  returnKeyType="go"
                  onSubmitEditing={changePassword}
                />
              </View>
              {!!pwError && <Text style={styles.errorText}>{pwError}</Text>}
              <Pressable
                onPress={changePassword}
                disabled={savingPassword}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }, savingPassword && { opacity: 0.75 }]}
                accessibilityRole="button"
              >
                {savingPassword ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Update password</Text>}
              </Pressable>
            </View>
          )}
        </View>

        {/* Log out */}
        <Pressable
          onPress={confirmSignOut}
          disabled={signingOut}
          style={({ pressed }) => [styles.logoutBtn, pressed && { backgroundColor: Colors.dangerTint }, signingOut && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={Colors.danger} />
          ) : (
            <>
              <LogOut size={18} color={Colors.danger} strokeWidth={1.9} />
              <Text style={styles.logoutText}>Log out</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footerNote}>Vatican Cake Point admin</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  screenTitle: { fontSize: 26, fontWeight: "700", color: Colors.ink, letterSpacing: -0.4, marginBottom: 16 },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    shadowColor: "#2A1B10",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  avatarRing: { width: 74, height: 74, borderRadius: 37, borderWidth: 1.5, borderColor: Colors.gold, justifyContent: "center", alignItems: "center" },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center" },
  avatarText: { color: Colors.gold, fontSize: 21, fontWeight: "600", letterSpacing: 1 },
  name: { fontSize: 19, fontWeight: "700", color: Colors.ink, letterSpacing: -0.2 },
  email: { fontSize: 13, color: Colors.inkSoft, marginTop: 2 },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: Colors.goldTint, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 10 },
  roleText: { fontSize: 12, fontWeight: "700", color: "#8A6A33" },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginTop: 26, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline, overflow: "hidden" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  iconTile: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center" },
  detailLabel: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 1 },
  detailValue: { fontSize: 15, fontWeight: "600", color: Colors.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.hairline, marginLeft: 68 },

  form: { paddingHorizontal: 16, paddingBottom: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline, paddingTop: 14 },
  field: { flexDirection: "row", alignItems: "center", height: 52, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  input: { flex: 1, fontSize: 16, color: Colors.ink },
  errorText: { fontSize: 12.5, color: Colors.danger, marginLeft: 2 },
  saveBtn: { height: 50, borderRadius: 14, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginTop: 4 },
  saveText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    marginTop: 32,
  },
  logoutText: { color: Colors.danger, fontSize: 16, fontWeight: "700" },
  footerNote: { textAlign: "center", fontSize: 12, color: Colors.inkMuted, marginTop: 20, letterSpacing: 0.4 },
});