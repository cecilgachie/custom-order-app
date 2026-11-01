import { AlertCircle, CheckCircle2, Info } from "lucide-react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";

export type ToastType = "success" | "error" | "info";
export type ToastOptions = {
  /** Force a style. If omitted, the message text decides (see detectType). */
  type?: ToastType;
  /** Milliseconds on screen. Defaults to 10 seconds. */
  duration?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 10000;
const ANIM_MS = 300;

/**
 * Most call sites pass a plain string, including raw error messages, so the
 * style is inferred from the wording unless the caller sets `type`.
 * Pass { type: "error" } for anything that must never look like a success.
 */
const ERROR_PATTERN =
  /(fail|could not|couldn't|unable|error|invalid|expired|denied|do not|does not|did not|cannot|can't|not match|not found|not confirmed|already|missing|required|must be|needs |at least|too long|wrong|try again|^(please|enter|choose|give) )/i;

const detectType = (message: string): ToastType =>
  ERROR_PATTERN.test(message.trim()) ? "error" : "success";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; message: string; type: ToastType } | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(-14)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  // The native driver crashes the web engine, so only use it on devices
  const useNative = Platform.OS !== "web";

  const animate = useCallback(
    (visible: boolean, onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: ANIM_MS, useNativeDriver: useNative }),
        Animated.timing(offset, { toValue: visible ? 0 : -14, duration: ANIM_MS, useNativeDriver: useNative }),
      ]).start(({ finished }) => {
        // If a newer toast interrupted this animation, finished is false and
        // we must not clear the newer message.
        if (finished && onDone) onDone();
      });
    },
    [opacity, offset, useNative]
  );

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    animate(false, () => setToast(null));
  }, [animate]);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      if (!message) return;
      clearTimer(); // one timer at a time, so a new toast is never cut short by an old one

      idRef.current += 1;
      setToast({ id: idRef.current, message, type: options?.type ?? detectType(message) });
      animate(true);

      timerRef.current = setTimeout(hide, options?.duration ?? DEFAULT_DURATION);
    },
    [animate, hide]
  );

  useEffect(() => clearTimer, []);

  // Stable identity: consumers that list showToast in effect deps will not re-run
  const value = useMemo(() => ({ showToast }), [showToast]);

  const tone =
    toast?.type === "error"
      ? { color: Colors.danger, Icon: AlertCircle, label: "Error" }
      : toast?.type === "info"
        ? { color: Colors.gold, Icon: Info, label: "Notice" }
        : { color: Colors.successGreen, Icon: CheckCircle2, label: "Success" };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + 8, opacity, transform: [{ translateY: offset }] }]}
        >
          <Pressable
            onPress={hide}
            style={styles.toast}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${tone.label}: ${toast.message}`}
            accessibilityHint="Double tap to dismiss"
          >
            <View style={[styles.accent, { backgroundColor: tone.color }]} />
            <tone.Icon size={20} color={tone.color} strokeWidth={2} style={styles.icon} />
            <Text style={styles.text}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

/** Safe fallback: outside a provider it logs instead of crashing the layout. */
export const useAppToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg: string) => {
        console.warn("Toast triggered outside a ToastProvider:", msg);
      },
    };
  }
  return context;
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, zIndex: 9999, elevation: 10, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 480,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingRight: 16,
    paddingLeft: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    shadowColor: "#2A1B10",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  icon: { marginRight: 12 },
  text: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: Colors.ink },
});