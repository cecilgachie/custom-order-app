import { Check, Share2, ShieldUser } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Colors } from "../constants/Colors";
import { supabase } from "../lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const ROLES = [
  { value: "Staff_Admin", label: "Staff Admin", hint: "Manage orders, complaints and customers" },
  { value: "System_Admin", label: "System Admin", hint: "Everything, including creating other staff" },
] as const;

type Role = (typeof ROLES)[number]["value"];
type Created = { email: string; password: string; role: Role };

/**
 * Lets a System Admin create a staff account with a temporary password.
 * The password is shown ONCE here and never stored; the new staff member must
 * choose their own before they can use the app.
 * Errors are shown inside the card (a toast would sit behind any open modal).
 */
export default function CreateStaffCard({ onCreated }: { onCreated?: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("Staff_Admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const create = async () => {
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    if (!EMAIL_RE.test(cleanEmail)) return setError("Enter a valid email address.");
    if (!USERNAME_RE.test(cleanUsername)) return setError("Username needs 3 to 20 letters, numbers or underscores.");

    setError(null);
    setBusy(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-create-staff", {
        body: { email: cleanEmail, username: cleanUsername, role },
      });

      if (fnError) {
        const response = (fnError as any).context;
        const status: number | undefined = response?.status;
        let body: any = null;
        try {
          body = await response?.json?.();
        } catch {
          /* no readable body */
        }
        console.warn("admin-create-staff failed:", status, body ?? fnError?.message);

        let message: string;
        if (body?.error) {
          message = body.detail ? `${body.error} (${body.detail})` : body.error;
        } else if (status === 404) {
          message = "The staff-creation function is not deployed yet. Deploy admin-create-staff, then try again.";
        } else if (status === 401) {
          message = "The server rejected your sign-in (401" + (body?.message ? `: ${body.message}` : "") + "). Deploy the function with --no-verify-jwt, or sign out and back in.";
        } else if (status) {
          message = `The server returned an error (${status}${body?.message ? `: ${body.message}` : ""}).`;
        } else {
          message = "Could not reach the server. Check your connection and that the function is deployed.";
        }
        throw new Error(message);
      }
      if (data?.ok === false || data?.error || !data?.temp_password) throw new Error(data?.error || "Could not create the account.");

      setCreated({ email: cleanEmail, password: data.temp_password, role });
      setEmail("");
      setUsername("");
      onCreated?.();
    } catch (e: any) {
      setError(e?.message || "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  const shareCredentials = () => {
    if (!created) return;
    Share.share({
      message:
        `Vatican Cake Point staff login\n\nEmail: ${created.email}\nTemporary password: ${created.password}\n\n` +
        `You will be asked to choose your own password the first time you sign in.`,
    }).catch(() => {});
  };

  /* ---------- the one-time credentials view ---------- */
  if (created) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.iconTile, { backgroundColor: Colors.successTint }]}>
            <Check size={16} color={Colors.successGreen} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>Account created</Text>
        </View>

        <Text style={styles.warn}>
          This password is shown only once and is not stored anywhere. Send it privately, then tap Done.
        </Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value} selectable>
          {created.email}
        </Text>

        <Text style={[styles.label, { marginTop: 12 }]}>Temporary password</Text>
        <View style={styles.passwordBox}>
          <Text style={styles.password} selectable>
            {created.password}
          </Text>
        </View>
        <Text style={styles.small}>They will be asked to choose their own password at first sign-in. Until then the account has no staff access.</Text>

        <View style={styles.row}>
          <Pressable onPress={shareCredentials} style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: Colors.goldTint }]} accessibilityRole="button">
            <Share2 size={16} color={Colors.ink} strokeWidth={1.75} />
            <Text style={styles.ghostText}>Share</Text>
          </Pressable>
          <Pressable onPress={() => setCreated(null)} style={({ pressed }) => [styles.primary, { flex: 1 }, pressed && { opacity: 0.9 }]} accessibilityRole="button">
            <Text style={styles.primaryText}>Done, I have shared it</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ---------- the form ---------- */
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconTile}>
          <ShieldUser size={16} color={Colors.gold} />
        </View>
        <Text style={styles.title}>Create a staff account</Text>
      </View>

      <TextInput
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (error) setError(null);
        }}
        placeholder="staff-email@domain.com"
        placeholderTextColor={Colors.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
        style={styles.input}
      />
      <TextInput
        value={username}
        onChangeText={(t) => {
          setUsername(t.toLowerCase());
          if (error) setError(null);
        }}
        placeholder="username"
        placeholderTextColor={Colors.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        editable={!busy}
        style={styles.input}
      />

      <View style={styles.row}>
        {ROLES.map((r) => {
          const active = role === r.value;
          return (
            <Pressable key={r.value} onPress={() => setRole(r.value)} style={[styles.rolePick, active && styles.rolePickActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Text style={[styles.roleText, active && styles.roleTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.small}>{ROLES.find((r) => r.value === role)?.hint}</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={create} disabled={busy} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }, busy && { opacity: 0.7 }]} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryText}>Create account</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.hairline, padding: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconTile: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  input: { marginTop: 10, height: 46, borderRadius: 10, borderWidth: 1, borderColor: Colors.hairline, backgroundColor: Colors.background, paddingHorizontal: 12, color: Colors.ink, fontSize: 14.5 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  rolePick: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: Colors.hairline, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  rolePickActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  roleText: { fontSize: 13, fontWeight: "600", color: Colors.inkSoft },
  roleTextActive: { color: Colors.gold },
  small: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 8, lineHeight: 18 },
  error: { fontSize: 13, color: Colors.danger, marginTop: 10, lineHeight: 19 },
  primary: { height: 46, borderRadius: 12, backgroundColor: Colors.ink, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 14 },
  primaryText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  ghost: { height: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.hairline, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  ghostText: { fontSize: 14, fontWeight: "600", color: Colors.ink },
  warn: { fontSize: 13, color: Colors.danger, backgroundColor: Colors.dangerTint, borderRadius: 10, padding: 10, marginTop: 12, lineHeight: 19 },
  label: { fontSize: 12, color: Colors.inkSoft, marginTop: 12 },
  value: { fontSize: 15, fontWeight: "600", color: Colors.ink, marginTop: 2 },
  passwordBox: { marginTop: 4, backgroundColor: Colors.goldTint, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, alignItems: "center" },
  password: { fontSize: 20, fontWeight: "700", color: Colors.ink, letterSpacing: 1.2, fontVariant: ["tabular-nums"] },
});