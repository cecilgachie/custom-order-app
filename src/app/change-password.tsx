import { useRouter } from "expo-router";
import { Eye, EyeOff, KeyRound } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { useAppToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";

const MIN_LENGTH = 10;

/**
 * Shown to staff created by an admin until they replace their temporary password.
 * The root layout sends them here and keeps them here.
 * Save as src/app/change-password.tsx
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError("Use both letters and numbers.");
    if (password !== confirm) return setError("The two passwords do not match.");

    setError(null);
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("change-temporary-password", {
        body: { new_password: password },
      });
      if (fnError) {
        let message = "Could not save your password. Please try again.";
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep generic */
        }
        throw new Error(message);
      }
      if (data?.ok === false || data?.error) throw new Error(data.error || "Could not save your password.");

      // Pick up the cleared flag. If the old session was ended by the change, sign in again.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email;
        if (email) await supabase.auth.signInWithPassword({ email, password });
      }

      showToast("Password saved. Welcome to the team!", { type: "success" });
      router.replace("/"); // the root guard sends staff to the admin area
    } catch (e: any) {
      setError(e?.message || "Could not save your password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* the guard handles the rest */
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Vatican Cake Point</Text>

        <View style={styles.icon}>
          <KeyRound size={28} color={Colors.gold} strokeWidth={1.75} />
        </View>
        <Text style={styles.title}>Choose your password</Text>
        <Text style={styles.sub}>You signed in with a temporary password. Choose your own to continue. Only you will know it.</Text>

        <View style={styles.field}>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError(null);
            }}
            placeholder="New password"
            placeholderTextColor={Colors.inkMuted}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            style={styles.input}
          />
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={19} color={Colors.inkMuted} /> : <Eye size={19} color={Colors.inkMuted} />}
          </Pressable>
        </View>
        <View style={styles.field}>
          <TextInput
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (error) setError(null);
            }}
            placeholder="Confirm new password"
            placeholderTextColor={Colors.inkMuted}
            secureTextEntry={!show}
            autoCapitalize="none"
            style={styles.input}
            returnKeyType="go"
            onSubmitEditing={save}
          />
        </View>

        <Text style={styles.hint}>At least {MIN_LENGTH} characters, with letters and numbers.</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }, saving && { opacity: 0.7 }]} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Save password and continue</Text>}
        </Pressable>

        <Pressable onPress={signOut} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },
  brand: { fontSize: 13, fontWeight: "700", letterSpacing: 1.6, color: Colors.gold, textTransform: "uppercase", marginBottom: 28 },
  icon: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", color: Colors.ink, letterSpacing: -0.5, textAlign: "center" },
  sub: { fontSize: 15, color: Colors.inkSoft, textAlign: "center", lineHeight: 22, marginTop: 8, marginBottom: 22, maxWidth: 380 },
  field: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", maxWidth: 420, height: 54, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline, marginBottom: 12 },
  input: { flex: 1, fontSize: 16, color: Colors.ink },
  hint: { alignSelf: "stretch", maxWidth: 420, fontSize: 12.5, color: Colors.inkSoft, marginTop: 2 },
  error: { alignSelf: "stretch", maxWidth: 420, fontSize: 13, color: Colors.danger, marginTop: 10, lineHeight: 19 },
  btn: { alignSelf: "stretch", maxWidth: 420, height: 54, borderRadius: 16, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginTop: 18 },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  link: { height: 48, justifyContent: "center", marginTop: 6 },
  linkText: { fontSize: 15, fontWeight: "600", color: Colors.inkSoft },
});