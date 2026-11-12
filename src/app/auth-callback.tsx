import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { useAppToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";

const MIN_PASSWORD = 8;

/** Reads key=value pairs from both the ?query and the #fragment of a link. */
function parseAuthUrl(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const [beforeHash, hash = ""] = raw.split("#");
  const query = beforeHash.includes("?") ? beforeHash.split("?")[1] : "";
  for (const part of [query, hash]) {
    for (const pair of part.split("&")) {
      if (!pair) continue;
      const i = pair.indexOf("=");
      const key = decodeURIComponent((i === -1 ? pair : pair.slice(0, i)).replace(/\+/g, " "));
      const value = i === -1 ? "" : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
      out[key] = value;
    }
  }
  return out;
}

type Status = "working" | "ready" | "error";

/**
 * The page our email links open (staff invitation, sign-up confirmation,
 * password reset). It signs the person in from the link, and when they have
 * no password yet, asks them to choose one.
 * Save as src/app/auth-callback.tsx
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const url = Linking.useURL();

  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<string | undefined>();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [waited, setWaited] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // On a phone the link can arrive a moment after the screen opens
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const isWeb = Platform.OS === "web";
    if (!isWeb && !url && !waited) return;

    let active = true;
    (async () => {
      const raw = isWeb ? (globalThis as any).window?.location?.href : url;
      const params = parseAuthUrl(raw);

      const fail = (text: string) => {
        if (!active) return;
        setMessage(text);
        setStatus("error");
      };

      if (params.error || params.error_description) {
        const text = (params.error_description || params.error || "").toLowerCase();
        return fail(
          text.includes("expired") || text.includes("invalid") || params.error_code === "otp_expired"
            ? "This link has expired or has already been used. Ask for a new invitation, or sign in if you already have a password."
            : params.error_description || "This link could not be used."
        );
      }

      try {
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
          if (error) throw error;
        } else if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        }

        // The app may already have signed the person in from the link
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return fail("This link has expired or has already been used. Ask for a new invitation, or sign in if you already have a password.");

        const user = session.user;
        const needs =
          params.type === "invite" ||
          params.type === "recovery" ||
          (!!user.invited_at && !user.user_metadata?.password_set);

        if (!active) return;
        setKind(params.type);
        setNeedsPassword(needs);
        setStatus("ready");
      } catch (e: any) {
        fail(e?.message || "This link could not be used.");
      }
    })();

    return () => {
      active = false;
    };
  }, [url, waited]);

  const savePassword = async () => {
    if (saving) return;
    if (password.length < MIN_PASSWORD) return setFormError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setFormError("The two passwords do not match.");

    setSaving(true);
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    setSaving(false);
    if (error) return setFormError(error.message || "Could not save your password.");

    showToast("Password saved. Welcome!", { type: "success" });
    router.replace("/"); // the root guard sends staff to the admin area and customers to the shop
  };

  const title = kind === "invite" ? "Welcome to the team" : kind === "recovery" ? "Choose a new password" : needsPassword ? "Set your password" : "Email verified";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Vatican Cake Point</Text>

        {status === "working" && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.gold} />
            <Text style={styles.sub}>Checking your link…</Text>
          </View>
        )}

        {status === "error" && (
          <View style={styles.center}>
            <View style={[styles.icon, { backgroundColor: Colors.dangerTint }]}>
              <AlertCircle size={30} color={Colors.danger} strokeWidth={1.75} />
            </View>
            <Text style={styles.title}>We could not open that link</Text>
            <Text style={styles.sub}>{message}</Text>
            <Pressable onPress={() => router.replace("/(auth)/login")} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]} accessibilityRole="button">
              <Text style={styles.btnText}>Go to sign in</Text>
            </Pressable>
          </View>
        )}

        {status === "ready" && (
          <View style={styles.center}>
            <View style={[styles.icon, { backgroundColor: needsPassword ? Colors.goldTint : Colors.successTint }]}>
              {needsPassword ? <KeyRound size={28} color={Colors.gold} strokeWidth={1.75} /> : <CheckCircle2 size={30} color={Colors.successGreen} strokeWidth={1.75} />}
            </View>
            <Text style={styles.title}>{title}</Text>

            {needsPassword ? (
              <>
                <Text style={styles.sub}>Choose a password to finish setting up your account.</Text>
                <View style={styles.field}>
                  <TextInput value={password} onChangeText={(t) => { setPassword(t); if (formError) setFormError(null); }} placeholder="New password" placeholderTextColor={Colors.inkMuted} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" style={styles.input} />
                </View>
                <View style={styles.field}>
                  <TextInput value={confirm} onChangeText={(t) => { setConfirm(t); if (formError) setFormError(null); }} placeholder="Confirm password" placeholderTextColor={Colors.inkMuted} secureTextEntry autoCapitalize="none" style={styles.input} returnKeyType="go" onSubmitEditing={savePassword} />
                </View>
                {!!formError && <Text style={styles.error}>{formError}</Text>}
                <Pressable onPress={savePassword} disabled={saving} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }, saving && { opacity: 0.7 }]} accessibilityRole="button">
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Save password and continue</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.sub}>Your email address is confirmed and you are signed in.</Text>
                <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]} accessibilityRole="button">
                  <Text style={styles.btnText}>Continue</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },
  brand: { fontSize: 13, fontWeight: "700", letterSpacing: 1.6, color: Colors.gold, textTransform: "uppercase", marginBottom: 28 },
  center: { maxWidth: 420, width: "100%", alignItems: "center", alignSelf: "center" },
  icon: { width: 68, height: 68, borderRadius: 34, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", color: Colors.ink, letterSpacing: -0.5, textAlign: "center" },
  sub: { fontSize: 15, color: Colors.inkSoft, textAlign: "center", lineHeight: 22, marginTop: 8, marginBottom: 20 },
  field: { alignSelf: "stretch", height: 54, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline, justifyContent: "center", marginBottom: 12 },
  input: { fontSize: 16, color: Colors.ink },
  error: { alignSelf: "stretch", fontSize: 13, color: Colors.danger, marginBottom: 8 },
  btn: { alignSelf: "stretch", height: 54, borderRadius: 16, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginTop: 8 },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});