import { useRouter } from "expo-router";
import { AlertTriangle, Check, Info, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
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
import { LEGAL_CONFIG } from "../../constants/legal";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

type DeletionCheck = {
  blocked: boolean;
  active_orders: number;
  pending_payments: number;
  is_staff: boolean;
};

const DELETED = [
  "Your profile, name, username, email address and profile picture",
  "Your sign-in. You will not be able to log in with this account again",
  "Your notifications, Nova usage records and support complaints",
  "Any cakes still in your cart that you have not paid for",
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [checking, setChecking] = useState(true);
  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [usesPassword, setUsesPassword] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active || !user) return;
        setEmail(user.email ?? null);
        // Google-only accounts have no password to re-enter
        setUsesPassword(Boolean(user.identities?.some((i) => i.provider === "email")));

        const { data, error: rpcError } = await supabase.rpc("my_account_deletion_check");
        if (rpcError) throw rpcError;
        if (active) setCheck(data as DeletionCheck);
      } catch (e: any) {
        if (active) setError(e?.message || "Could not check your account. Please try again.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const ready = confirmText.trim() === "DELETE" && (!usesPassword || password.length > 0);

  const performDelete = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // Re-check the password so a lost, unlocked phone cannot delete the account
      if (usesPassword) {
        if (!email) throw new Error("Could not verify your account.");
        const { error: pwError } = await supabase.auth.signInWithPassword({ email, password });
        if (pwError) {
          setError("That password is not correct.");
          return;
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke("delete-account", {
        body: { confirm: "DELETE" },
      });
      if (fnError) {
        let message = "We could not delete your account. Please try again.";
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep generic */
        }
        throw new Error(message);
      }
      if (data?.ok === false || data?.error) throw new Error(data.error || "We could not delete your account.");

      // The account no longer exists: clear the saved session on this phone
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* nothing left to sign out of */
      }
      showToast("Your account has been deleted.", { type: "success", duration: 8000 });
      // The root layout now sends the user to the login screen
    } catch (e: any) {
      setError(e?.message || "We could not delete your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmAndDelete = () => {
    if (!ready || busy) return;
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm("This cannot be undone. Delete your account permanently?")) performDelete();
      return;
    }
    Alert.alert("Delete account permanently?", "This cannot be undone.", [
      { text: "Keep my account", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: performDelete },
    ]);
  };

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const blockers: string[] = [];
  if (check?.is_staff) blockers.push("This is a staff account. Staff accounts must be removed by a System Admin.");
  if ((check?.active_orders ?? 0) > 0)
    blockers.push(
      `You have ${check!.active_orders} paid ${check!.active_orders === 1 ? "order" : "orders"} that ${check!.active_orders === 1 ? "has" : "have"} not been delivered yet. Once ${check!.active_orders === 1 ? "it is" : "they are"} delivered or cancelled, you can delete your account.`
    );
  if ((check?.pending_payments ?? 0) > 0)
    blockers.push("A payment is still being confirmed. Please try again in a few minutes.");

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Trash2 size={28} color={Colors.danger} strokeWidth={1.75} />
        </View>
        <Text style={styles.title}>Delete your account</Text>
        <Text style={styles.lead}>This permanently removes your account. It cannot be undone.</Text>

        {/* What happens */}
        <Text style={styles.sectionTitle}>What we delete</Text>
        <View style={styles.card}>
          {DELETED.map((line, i) => (
            <View key={line} style={[styles.line, i === DELETED.length - 1 && { marginBottom: 0 }]}>
              <Check size={16} color={Colors.successGreen} strokeWidth={2.5} style={{ marginTop: 3 }} />
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>What we keep</Text>
        <View style={[styles.card, styles.keepCard]}>
          <Info size={18} color={Colors.gold} strokeWidth={1.75} style={{ marginTop: 2 }} />
          <Text style={styles.lineText}>
            Records of past orders and payments (amounts, dates, order numbers and M-Pesa receipt codes), because we must keep financial records. Your name, phone number and anything you typed, such as
            inscriptions and notes, are removed from them.
          </Text>
        </View>

        {/* Blocked */}
        {check?.blocked ? (
          <View style={styles.blockCard}>
            <AlertTriangle size={20} color={Colors.danger} strokeWidth={1.75} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={styles.blockTitle}>You cannot delete your account yet</Text>
              {blockers.map((b) => (
                <Text key={b} style={styles.blockText}>
                  {b}
                </Text>
              ))}
              <Text style={styles.blockText}>Questions? Email {LEGAL_CONFIG.contactEmail}.</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Confirm</Text>
            <Text style={styles.label}>Type DELETE to confirm</Text>
            <TextInput
              value={confirmText}
              onChangeText={(t) => {
                setConfirmText(t);
                if (error) setError(null);
              }}
              placeholder="DELETE"
              placeholderTextColor={Colors.inkMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              style={styles.input}
            />

            {usesPassword && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>Your password</Text>
                <TextInput
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.inkMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!busy}
                  style={styles.input}
                />
              </>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              onPress={confirmAndDelete}
              disabled={!ready || busy}
              style={({ pressed }) => [styles.deleteBtn, (!ready || busy) && { opacity: 0.4 }, pressed && ready && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Delete my account permanently"
            >
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.deleteText}>Delete my account permanently</Text>}
            </Pressable>
          </>
        )}

        {!!error && check?.blocked && <Text style={styles.errorText}>{error}</Text>}

        <Pressable onPress={() => router.back()} style={styles.cancelBtn} accessibilityRole="button">
          <Text style={styles.cancelText}>Keep my account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  scroll: { padding: 20 },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.dangerTint, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 26, fontWeight: "800", color: Colors.ink, letterSpacing: -0.5 },
  lead: { fontSize: 15, color: Colors.inkSoft, marginTop: 6, lineHeight: 22 },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginTop: 24, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  keepCard: { flexDirection: "row", gap: 12, backgroundColor: Colors.goldTint },
  line: { flexDirection: "row", gap: 10, marginBottom: 10 },
  lineText: { flex: 1, fontSize: 14.5, color: Colors.inkSoft, lineHeight: 21 },

  blockCard: { flexDirection: "row", gap: 12, backgroundColor: Colors.dangerTint, borderWidth: 1, borderColor: Colors.dangerBorder, borderRadius: 18, padding: 16, marginTop: 24 },
  blockTitle: { fontSize: 15.5, fontWeight: "700", color: Colors.danger },
  blockText: { fontSize: 14, color: Colors.danger, lineHeight: 20 },

  label: { fontSize: 14, fontWeight: "600", color: Colors.ink, marginBottom: 8 },
  input: {
    height: 52, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, color: Colors.ink,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline,
  },
  errorText: { fontSize: 13, color: Colors.danger, marginTop: 10, lineHeight: 19 },
  deleteBtn: { height: 54, borderRadius: 16, backgroundColor: Colors.danger, justifyContent: "center", alignItems: "center", marginTop: 20 },
  deleteText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  cancelBtn: { height: 50, justifyContent: "center", alignItems: "center", marginTop: 10 },
  cancelText: { fontSize: 15.5, fontWeight: "600", color: Colors.ink },
});