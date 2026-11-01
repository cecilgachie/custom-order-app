import * as AuthSession from "expo-auth-session";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react-native";
import { ReactNode, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
} from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const MIN_PASSWORD = 8;

/* ------------------------------------------------------------------ */
/* Small reusable field: leading icon, input, optional trailing action */
/* ------------------------------------------------------------------ */
function Field({
  icon,
  right,
  ...inputProps
}: TextInputProps & { icon: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldIcon}>{icon}</View>
      <TextInput
        placeholderTextColor={Colors.inkMuted}
        style={styles.fieldInput}
        {...inputProps}
      />
      {right}
    </View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState<null | "auth" | "google">(null);

  // Password reset (in-app code flow)
  const [forgotModal, setForgotModal] = useState(false);
  const [resetStep, setResetStep] = useState<"email" | "code">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  /* ---------- helpers ---------- */
  const checkUsernameTaken = async (value: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", value)
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    return Boolean(data);
  };

  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setPassword("");
    setConfirmPassword("");
  };

  /* ---------- email / password ---------- */
  // Navigation after sign-in is handled by the guard in the root layout
  // (customers go to the tabs, staff go to the admin panel).
  const handleAuth = async () => {
    if (busy) return;
    if (!isSupabaseConfigured) return showToast(supabaseConfigError);

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail))
      return showToast("Enter a valid email address.");
    if (!password) return showToast("Enter your password.");

    setBusy("auth");
    try {
      if (isSignUp) {
        const cleanUsername = username.trim().toLowerCase();
        if (!USERNAME_RE.test(cleanUsername))
          return showToast(
            "Username needs 3 to 20 letters, numbers or underscores.",
          );
        if (password.length < MIN_PASSWORD)
          return showToast(
            `Password must be at least ${MIN_PASSWORD} characters.`,
          );
        if (password !== confirmPassword)
          return showToast("Passwords do not match.");

        if (await checkUsernameTaken(cleanUsername))
          return showToast("That username is already taken.");

        // The username also travels as metadata, so a database trigger can
        // copy it into profiles even when there is no session yet (email
        // confirmation on), where a client-side update would be blocked by RLS.
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { username: cleanUsername } },
        });
        if (error) throw error;

        // With confirmation on, an existing email comes back with no identities
        if (data.user && data.user.identities?.length === 0)
          return showToast(
            "An account with this email already exists. Try signing in.",
          );

        // Only possible when email confirmation is off and a session exists
        if (data.session && data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ username: cleanUsername })
            .eq("id", data.user.id);
          if (profileError) showToast(profileError.message);
          return;
        }

        showToast("Account created! Check your email to verify, then sign in.");
        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        showToast("Welcome back!");
      }
    } catch (error: any) {
      showToast(error?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------- google ---------- */
  const handleGoogleLogin = async () => {
    if (busy) return;
    if (!isSupabaseConfigured) return showToast(supabaseConfigError);

    setBusy("google");
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: "vaticancakeapp",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });
      if (error) throw error;

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      if (res.type !== "success" || !res.url) return; // cancelled

      const query = res.url.includes("#")
        ? res.url.split("#")[1]
        : res.url.split("?")[1];
      const params = new URLSearchParams(query ?? "");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (!access_token || !refresh_token)
        return showToast(
          "Google sign-in did not return a session. Please try again.",
        );

      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (sessionError) throw sessionError;
      showToast("Signed in with Google!");
    } catch (error: any) {
      showToast(error?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------- password reset ---------- */
  const openForgot = () => {
    setResetEmail(email.trim());
    setResetStep("email");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setForgotModal(true);
  };

  const closeForgot = () => {
    if (!resetBusy) setForgotModal(false);
  };

  const sendResetCode = async () => {
    if (resetBusy) return;
    if (!isSupabaseConfigured) return showToast(supabaseConfigError);

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail))
      return showToast("Enter a valid email address.");

    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;
      setResetEmail(cleanEmail);
      setResetStep("code");
      showToast("If that email has an account, a reset code is on its way.");
    } catch (error: any) {
      showToast(error?.message ?? "Could not send the reset code.");
    } finally {
      setResetBusy(false);
    }
  };

  const confirmReset = async () => {
    if (resetBusy) return;

    const code = resetCode.replace(/\s/g, "");
    if (code.length < 6) return showToast("Enter the code from your email.");
    if (newPassword.length < MIN_PASSWORD)
      return showToast(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (newPassword !== confirmNewPassword)
      return showToast("Passwords do not match.");

    setResetBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: resetEmail,
        token: code,
        type: "recovery",
      });
      if (verifyError) throw verifyError;

      // Same async step as verifyOtp: runs before the root guard can navigate away
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      showToast("Password updated. You are now signed in.");
      setForgotModal(false);
    } catch (error: any) {
      showToast(error?.message ?? "Could not reset your password.");
    } finally {
      setResetBusy(false);
    }
  };

  /* ---------- render ---------- */
  const passwordToggle = (
    <Pressable
      onPress={() => setShowPassword((v) => !v)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? (
        <EyeOff size={19} color={Colors.inkMuted} strokeWidth={1.75} />
      ) : (
        <Eye size={19} color={Colors.inkMuted} strokeWidth={1.75} />
      )}
    </Pressable>
  );

  return (
    <ImageBackground
      source={{
        uri: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800",
      }}
      style={styles.bg}
    >
      <View style={styles.scrim} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <BlurView intensity={70} tint="light" style={styles.glassContainer}>
            <Text style={styles.title}>Vatican Cake Point</Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? "Create an account to start ordering."
                : "Sign in to order your dream cake."}
            </Text>

            {/* Mode switch */}
            <View style={styles.segment}>
              {([false, true] as const).map((signUp) => {
                const active = isSignUp === signUp;
                return (
                  <Pressable
                    key={String(signUp)}
                    onPress={() => switchMode(signUp)}
                    style={[
                      styles.segmentBtn,
                      active && styles.segmentBtnActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                      ]}
                    >
                      {signUp ? "Create account" : "Sign in"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Field
              icon={
                <Mail size={18} color={Colors.inkMuted} strokeWidth={1.75} />
              }
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            {isSignUp && (
              <Field
                icon={
                  <User size={18} color={Colors.inkMuted} strokeWidth={1.75} />
                }
                placeholder="Username"
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase())}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="next"
              />
            )}

            <Field
              icon={
                <Lock size={18} color={Colors.inkMuted} strokeWidth={1.75} />
              }
              right={passwordToggle}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              textContentType={isSignUp ? "newPassword" : "password"}
              returnKeyType={isSignUp ? "next" : "go"}
              onSubmitEditing={isSignUp ? undefined : handleAuth}
            />

            {isSignUp && (
              <Field
                icon={
                  <Lock size={18} color={Colors.inkMuted} strokeWidth={1.75} />
                }
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={handleAuth}
              />
            )}

            {!isSignUp && (
              <Pressable
                onPress={openForgot}
                hitSlop={8}
                style={styles.forgotLink}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleAuth}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.mainBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
                !!busy && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
            >
              {busy === "auth" ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>
                  {isSignUp ? "Create account" : "Sign in"}
                </Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGoogleLogin}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && { backgroundColor: Colors.background },
                !!busy && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
            >
              {busy === "google" ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Text style={styles.googleText}>Continue with Google</Text>
              )}
            </Pressable>
          </BlurView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PASSWORD RESET */}
      <Modal
        visible={forgotModal}
        transparent
        animationType="fade"
        onRequestClose={closeForgot}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForgot} />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset your password</Text>
              <Pressable
                onPress={closeForgot}
                hitSlop={10}
                style={styles.modalClose}
                accessibilityLabel="Close"
              >
                <X size={17} color={Colors.ink} />
              </Pressable>
            </View>

            {resetStep === "email" ? (
              <>
                <Text style={styles.modalText}>
                  Enter your account email and we will send you a code to set a
                  new password.
                </Text>
                <Field
                  icon={
                    <Mail
                      size={18}
                      color={Colors.inkMuted}
                      strokeWidth={1.75}
                    />
                  }
                  placeholder="Email address"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={sendResetCode}
                />
                <Pressable
                  onPress={sendResetCode}
                  disabled={resetBusy}
                  style={({ pressed }) => [
                    styles.mainBtn,
                    pressed && { opacity: 0.9 },
                    resetBusy && { opacity: 0.75 },
                  ]}
                >
                  {resetBusy ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.btnText}>Send code</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalText}>
                  We sent a code to {resetEmail}. Enter it below with your new
                  password.
                </Text>
                <Field
                  icon={
                    <KeyRound
                      size={18}
                      color={Colors.inkMuted}
                      strokeWidth={1.75}
                    />
                  }
                  placeholder="Code from email"
                  value={resetCode}
                  onChangeText={(t) => setResetCode(t.replace(/[^\d]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={8}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                />
                <Field
                  icon={
                    <Lock
                      size={18}
                      color={Colors.inkMuted}
                      strokeWidth={1.75}
                    />
                  }
                  right={passwordToggle}
                  placeholder="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                />
                <Field
                  icon={
                    <Lock
                      size={18}
                      color={Colors.inkMuted}
                      strokeWidth={1.75}
                    />
                  }
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={confirmReset}
                />
                <Pressable
                  onPress={confirmReset}
                  disabled={resetBusy}
                  style={({ pressed }) => [
                    styles.mainBtn,
                    pressed && { opacity: 0.9 },
                    resetBusy && { opacity: 0.75 },
                  ]}
                >
                  {resetBusy ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.btnText}>Update password</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setResetStep("email")}
                  hitSlop={8}
                  style={{ alignSelf: "center", marginTop: 14 }}
                >
                  <Text style={styles.linkText}>Use a different email</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: Colors.ink },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(20,12,8,0.45)" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  glassContainer: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.6)", // keeps text readable where blur is unsupported
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.glassBorder,
  },
  title: {
    fontSize: 27,
    fontWeight: "700",
    color: Colors.ink,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.inkSoft,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
  },

  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 11,
  },
  segmentBtnActive: { backgroundColor: Colors.ink },
  segmentText: { fontSize: 14, fontWeight: "600", color: Colors.inkSoft },
  segmentTextActive: { color: Colors.gold },

  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  fieldIcon: { marginRight: 12 },
  fieldInput: { flex: 1, fontSize: 16, color: Colors.ink, height: "100%" },

  forgotLink: { alignSelf: "flex-end", marginBottom: 14, marginTop: 2 },
  linkText: { fontSize: 14, fontWeight: "600", color: Colors.ink },

  mainBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.ink,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.inkMuted,
  },
  dividerText: { fontSize: 13, color: Colors.inkSoft },

  googleBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  googleText: { color: Colors.ink, fontWeight: "600", fontSize: 16 },

  /* reset modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,12,8,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  modalText: {
    fontSize: 14,
    color: Colors.inkSoft,
    lineHeight: 21,
    marginBottom: 16,
  },
});
