import { X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { normalizeKenyanPhone } from "../lib/mpesa";

const SHEET_HEIGHT = Math.min(
  440,
  Math.round(Dimensions.get("window").height * 0.62),
);

type Props = {
  visible: boolean;
  title: string;
  amount: number;
  /** Small line under the amount, e.g. "Balance for VCP-261102-00042" */
  note?: string;
  onClose: () => void;
  /** Should throw an Error (with a customer-friendly message) if the request fails. */
  onSubmit: (msisdn: string) => Promise<void>;
};

export default function MpesaPaySheet({
  visible,
  title,
  amount,
  note,
  onClose,
  onSubmit,
}: Props) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [shown, setShown] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Mount, slide in; slide out, then unmount
  useEffect(() => {
    if (visible) {
      setError(null);
      setShown(true);
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else if (shown) {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const handlePay = async () => {
    if (processing) return;
    const msisdn = normalizeKenyanPhone(phone);
    if (!msisdn)
      return setError("Enter a valid Safaricom number, e.g. 0712 345 678.");

    setError(null);
    setProcessing(true);
    try {
      await onSubmit(msisdn);
    } catch (e: any) {
      setError(
        e?.message || "Could not start the M-Pesa request. Please try again.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const close = () => {
    if (!processing) onClose();
  };

  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={close}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityLabel="Close"
            >
              <X size={18} color={Colors.ink} />
            </Pressable>
          </View>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount to pay</Text>
            <Text style={styles.amountValue}>
              KES {Math.round(amount).toLocaleString()}
            </Text>
            {!!note && <Text style={styles.amountNote}>{note}</Text>}
          </View>

          <Text style={styles.inputLabel}>M-Pesa phone number</Text>
          <View
            style={[styles.field, !!error && { borderColor: Colors.danger }]}
          >
            <Text style={styles.prefix}>+254</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (error) setError(null);
              }}
              placeholder="712 345 678"
              placeholderTextColor={Colors.inkMuted}
              keyboardType="phone-pad"
              editable={!processing}
              maxLength={16}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={handlePay}
            />
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.helper}>
              You will get a prompt on this phone to enter your PIN.
            </Text>
          )}

          <Pressable
            onPress={handlePay}
            disabled={processing}
            style={({ pressed }) => [
              styles.payBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
              processing && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
          >
            {processing ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.payText}>Sending request…</Text>
              </>
            ) : (
              <Text style={styles.payText}>
                Pay KES {Math.round(amount).toLocaleString()}
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(20,12,8,0.55)",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.ink,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  amountCard: {
    backgroundColor: Colors.goldTint,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  amountLabel: { fontSize: 13, color: Colors.inkSoft },
  amountValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.ink,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  amountNote: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 6 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.ink,
    marginBottom: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.background,
  },
  prefix: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.ink,
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.hairline,
  },
  input: { flex: 1, fontSize: 16, color: Colors.ink, letterSpacing: 0.4 },
  helper: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 8 },
  error: { fontSize: 12.5, color: Colors.danger, marginTop: 8 },
  payBtn: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.ink,
    marginTop: 22,
  },
  payText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
