import { BlurView } from "expo-blur";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Tokens + constants                                                  */
/* ------------------------------------------------------------------ */
const { height } = Dimensions.get("window");
const SHEET_HEIGHT = Math.min(440, Math.round(height * 0.62));

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

/** Name of the Supabase Edge Function that triggers the Daraja STK push. */
const MPESA_FUNCTION = "mpesa-stk-push";

type PaymentType = "Full" | "Deposit";

type CartItem = {
  id: string | number;
  cake_title: string;
  flavor?: string | null;
  cake_size?: string | null;
  total_weight_kg?: number | null;
  cake_message?: string | null;
  total_price: number | string;
  payment_type: PaymentType;
  [key: string]: any;
};

/* ------------------------------------------------------------------ */
/* Money helpers (deposit rounds up so every amount is a whole KES,    */
/* which is what M-Pesa requires)                                      */
/* ------------------------------------------------------------------ */
const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const priceOf = (item: CartItem) => Number(item.total_price) || 0;
const dueNowOf = (item: CartItem) =>
  item.payment_type === "Deposit"
    ? Math.ceil(priceOf(item) / 2)
    : priceOf(item);

/** Accepts 07XX, 01XX, +2547XX, 2547XX and returns 2547XXXXXXXX, or null. */
const normalizeKenyanPhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d]/g, "");
  let msisdn = digits;
  if (digits.startsWith("0")) msisdn = `254${digits.slice(1)}`;
  else if (digits.startsWith("7") || digits.startsWith("1"))
    msisdn = `254${digits}`;
  return /^254(7|1)\d{8}$/.test(msisdn) ? msisdn : null;
};

const confirmAction = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) => {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n${message}`))
      onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Keep it", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(240);

  // Checkout sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  /* ---------- data ---------- */
  const fetchCartItems = useCallback(
    async (mode: "refresh" | "silent" = "silent") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          toastRef.current("Please log in to view your cart.");
          router.replace("/(auth)/login");
          return;
        }

        const { data, error } = await supabase
          .from("cake_orders")
          .select("*")
          .eq("user_id", user.id)
          .eq("payment_status", "Unpaid")
          .eq("order_status", "Pending Review")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setCartItems((data as CartItem[]) || []);
      } catch (error: any) {
        toastRef.current(error?.message || "Error reading active cart.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  // Tabs stay mounted, so refetch every time the cart tab gains focus.
  // This is what makes cakes added from Home show up here immediately.
  useFocusEffect(
    useCallback(() => {
      fetchCartItems("silent");
    }, [fetchCartItems]),
  );

  /* ---------- row actions ---------- */
  const removeCartItem = (item: CartItem) => {
    confirmAction(
      "Remove cake",
      `Remove "${item.cake_title}" from your cart?`,
      "Remove",
      async () => {
        const id = String(item.id);
        setRemovingId(id);
        try {
          const { error } = await supabase
            .from("cake_orders")
            .delete()
            .eq("id", item.id);
          if (error) throw error;
          setCartItems((prev) => prev.filter((i) => String(i.id) !== id));
          showToast("Item removed from cart 🎂");
        } catch (error: any) {
          showToast(error?.message || "Could not remove this item.");
        } finally {
          setRemovingId(null);
        }
      },
    );
  };

  // Optimistic update with rollback if the write fails
  const setPaymentType = async (item: CartItem, next: PaymentType) => {
    if (item.payment_type === next || updatingId || processing) return;
    const id = String(item.id);
    const previous = item.payment_type;

    setUpdatingId(id);
    setCartItems((prev) =>
      prev.map((i) => (String(i.id) === id ? { ...i, payment_type: next } : i)),
    );
    try {
      const { error } = await supabase
        .from("cake_orders")
        .update({ payment_type: next })
        .eq("id", item.id);
      if (error) throw error;
    } catch (error: any) {
      setCartItems((prev) =>
        prev.map((i) =>
          String(i.id) === id ? { ...i, payment_type: previous } : i,
        ),
      );
      showToast(error?.message || "Could not update payment option.");
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---------- totals ---------- */
  const { totalGross, totalDueNow, balanceLater } = useMemo(() => {
    const gross = cartItems.reduce((sum, i) => sum + priceOf(i), 0);
    const now = cartItems.reduce((sum, i) => sum + dueNowOf(i), 0);
    return { totalGross: gross, totalDueNow: now, balanceLater: gross - now };
  }, [cartItems]);

  /* ---------- checkout sheet ---------- */
  useEffect(() => {
    if (sheetVisible) {
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    }
  }, [sheetVisible, translateY]);

  const openCheckout = () => {
    if (cartItems.length === 0 || updatingId) return;
    setPhoneError(null);
    setSheetVisible(true);
  };

  const closeCheckout = useCallback(() => {
    if (processing) return;
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [processing, translateY]);

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const handlePay = async () => {
    if (processing) return;

    const msisdn = normalizeKenyanPhone(phone);
    if (!msisdn) {
      setPhoneError("Enter a valid Safaricom number, e.g. 0712 345 678.");
      return;
    }
    setPhoneError(null);
    setProcessing(true);

    try {
      // The server must recompute the amount from these order ids.
      // Never trust a client-sent amount for a real charge.
      const { data, error } = await supabase.functions.invoke(MPESA_FUNCTION, {
        body: {
          phone: msisdn,
          amount: totalDueNow,
          order_ids: cartItems.map((i) => i.id),
        },
      });

      if (error) {
        let message = error.message || "Could not start the M-Pesa request.";
        try {
          const payload = await (error as any).context?.json?.();
          if (payload?.error) message = payload.error;
        } catch {
          // fall back to the generic error message above
        }
        throw new Error(message);
      }

      if (data?.error) throw new Error(data.error);

      setProcessing(false);
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setSheetVisible(false));
      showToast(
        "Check your phone and enter your M-Pesa PIN to complete payment 📱",
      );
    } catch (error: any) {
      setProcessing(false);
      showToast(
        error?.message ||
          "Could not start the M-Pesa request. Please try again.",
      );
    }
  };

  /* ---------- render ---------- */
  if (loading) {
    return (
      <View style={styles.centerView}>
        <ActivityIndicator size="large" color={theme.gold} />
        <Text style={styles.loadingText}>Loading your cart…</Text>
      </View>
    );
  }

  const count = cartItems.length;

  const renderItem = ({ item }: { item: CartItem }) => {
    const id = String(item.id);
    const isRemoving = removingId === id;
    const isUpdating = updatingId === id;
    const isDeposit = item.payment_type === "Deposit";
    const specs = [
      item.flavor,
      item.cake_size ? `${item.cake_size} size` : null,
      item.total_weight_kg ? `${item.total_weight_kg} kg` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <View style={[styles.itemCard, isRemoving && { opacity: 0.5 }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cakeTitle} numberOfLines={1}>
              {item.cake_title}
            </Text>
            {!!specs && <Text style={styles.cakeSpecs}>{specs}</Text>}
          </View>
          <Pressable
            onPress={() => removeCartItem(item)}
            disabled={isRemoving}
            hitSlop={10}
            style={({ pressed }) => [
              styles.trashBtn,
              pressed && { backgroundColor: theme.dangerTint },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.cake_title}`}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Trash2 size={17} color={theme.danger} strokeWidth={1.75} />
            )}
          </Pressable>
        </View>

        {!!item.cake_message && (
          <View style={styles.msgBubble}>
            <Text style={styles.msgText}>
              Inscription: “{item.cake_message}”
            </Text>
          </View>
        )}

        <View style={styles.billingRow}>
          <View>
            <Text style={styles.priceLabel}>
              {isDeposit ? "Pay now (50%)" : "Pay now"}
            </Text>
            <Text style={styles.priceAmount}>{formatKes(dueNowOf(item))}</Text>
            <Text style={styles.priceSub}>
              {isDeposit
                ? `of ${formatKes(priceOf(item))} total`
                : "Full amount"}
            </Text>
          </View>

          <View style={[styles.segment, isUpdating && { opacity: 0.6 }]}>
            {(["Full", "Deposit"] as PaymentType[]).map((type) => {
              const active = item.payment_type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setPaymentType(item, type)}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={
                    type === "Full" ? "Pay in full" : "Pay 50 percent deposit"
                  }
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {type === "Full" ? "Full" : "50% deposit"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>My Cart</Text>
        <Text style={styles.headerSubtitle}>
          {count === 0
            ? "Nothing here yet"
            : `${count} ${count === 1 ? "cake" : "cakes"} ready to order`}
        </Text>
      </View>

      {/* ITEMS */}
      <FlatList
        data={cartItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: count > 0 ? footerHeight + 24 : 40 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchCartItems("refresh")}
            tintColor={theme.gold}
            colors={[theme.gold]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <View style={styles.emptyIcon}>
              <ShoppingBag size={34} color={theme.gold} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>
              Pick a cake from the catalog and it will appear here.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.browseBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.replace("/(tabs)")}
              accessibilityRole="button"
            >
              <Text style={styles.browseBtnText}>Browse cakes</Text>
            </Pressable>
          </View>
        }
      />

      {/* FOOTER SUMMARY */}
      {count > 0 && (
        <BlurView
          intensity={80}
          tint="light"
          style={styles.checkoutFooter}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Order total</Text>
            <Text style={styles.summaryValue}>{formatKes(totalGross)}</Text>
          </View>

          {balanceLater > 0 && (
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Balance due at delivery</Text>
              <Text style={styles.summaryValue}>{formatKes(balanceLater)}</Text>
            </View>
          )}

          <View style={[styles.summaryLine, styles.totalDueLine]}>
            <Text style={styles.totalDueLabel}>Due now</Text>
            <Text style={styles.totalDueValue}>{formatKes(totalDueNow)}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.checkoutBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
              !!updatingId && { opacity: 0.6 },
            ]}
            onPress={openCheckout}
            disabled={!!updatingId}
            accessibilityRole="button"
            accessibilityLabel={`Checkout, ${formatKes(totalDueNow)} due now`}
          >
            <Smartphone size={19} color={theme.gold} strokeWidth={1.9} />
            <Text style={styles.checkoutBtnText}>Pay with M-Pesa</Text>
            <ChevronRight
              size={18}
              color="#FFF"
              style={{ marginLeft: "auto" }}
            />
          </Pressable>
        </BlurView>
      )}

      {/* M-PESA CHECKOUT SHEET */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeCheckout}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View
            style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeCheckout}
              accessibilityLabel="Close checkout"
            />
          </Animated.View>

          <Animated.View
            style={[styles.sheet, { transform: [{ translateY }] }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Pay with M-Pesa</Text>
              <Pressable
                onPress={closeCheckout}
                hitSlop={10}
                style={styles.sheetClose}
                accessibilityLabel="Close"
              >
                <X size={18} color={theme.ink} />
              </Pressable>
            </View>

            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Amount to pay now</Text>
              <Text style={styles.amountValue}>{formatKes(totalDueNow)}</Text>
              {balanceLater > 0 && (
                <Text style={styles.amountNote}>
                  {formatKes(balanceLater)} balance is due at delivery.
                </Text>
              )}
            </View>

            <Text style={styles.inputLabel}>M-Pesa phone number</Text>
            <View
              style={[
                styles.phoneField,
                !!phoneError && { borderColor: theme.danger },
              ]}
            >
              <Text style={styles.phonePrefix}>+254</Text>
              <TextInput
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (phoneError) setPhoneError(null);
                }}
                placeholder="712 345 678"
                placeholderTextColor={theme.inkMuted}
                keyboardType="phone-pad"
                editable={!processing}
                maxLength={16}
                style={styles.phoneInput}
                returnKeyType="done"
                onSubmitEditing={handlePay}
              />
            </View>
            {phoneError ? (
              <Text style={styles.errorText}>{phoneError}</Text>
            ) : (
              <Text style={styles.helperText}>
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
                  <Text style={styles.payBtnText}>Sending request…</Text>
                </>
              ) : (
                <Text style={styles.payBtnText}>
                  Pay {formatKes(totalDueNow)}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  centerView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.background,
  },
  loadingText: { marginTop: 12, color: theme.inkSoft, fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: -0.4,
  },
  headerSubtitle: { fontSize: 14, color: theme.inkSoft, marginTop: 3 },

  listContainer: { paddingHorizontal: 16, paddingTop: 4 },

  emptyView: { alignItems: "center", marginTop: 56, paddingHorizontal: 24 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.goldTint,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.ink },
  emptyText: {
    fontSize: 14,
    color: theme.inkSoft,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 21,
  },
  browseBtn: {
    backgroundColor: theme.ink,
    paddingHorizontal: 24,
    height: 48,
    justifyContent: "center",
    borderRadius: 14,
    marginTop: 22,
  },
  browseBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  itemCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
    shadowColor: "#2A1B10",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cakeTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: -0.2,
  },
  cakeSpecs: { fontSize: 13, color: theme.inkSoft, marginTop: 3 },
  trashBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  msgBubble: {
    backgroundColor: theme.goldTint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
  },
  msgText: { fontSize: 13, color: theme.inkSoft, lineHeight: 19 },

  billingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.hairline,
    paddingTop: 14,
    marginTop: 14,
  },
  priceLabel: { fontSize: 12, color: theme.inkSoft },
  priceAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.ink,
    marginTop: 2,
  },
  priceSub: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },

  segment: {
    flexDirection: "row",
    backgroundColor: theme.background,
    borderRadius: 12,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    height: 34,
    justifyContent: "center",
    borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: theme.ink },
  segmentText: { fontSize: 12.5, fontWeight: "600", color: theme.inkSoft },
  segmentTextActive: { color: theme.gold },

  checkoutFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.hairline,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(250,248,245,0.75)",
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: { color: theme.inkSoft, fontSize: 14 },
  summaryValue: { fontWeight: "600", fontSize: 14, color: theme.ink },
  totalDueLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.hairline,
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 14,
    alignItems: "baseline",
  },
  totalDueLabel: { fontWeight: "700", fontSize: 15, color: theme.ink },
  totalDueValue: {
    fontWeight: "800",
    fontSize: 21,
    color: theme.ink,
    letterSpacing: -0.3,
  },
  checkoutBtn: {
    backgroundColor: theme.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    height: 54,
    borderRadius: 16,
  },
  checkoutBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },

  /* sheet */
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(20,12,8,0.55)",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: -0.3,
  },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.background,
    justifyContent: "center",
    alignItems: "center",
  },
  amountCard: {
    backgroundColor: theme.goldTint,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  amountLabel: { fontSize: 13, color: theme.inkSoft },
  amountValue: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.ink,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  amountNote: { fontSize: 12.5, color: theme.inkSoft, marginTop: 6 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
    marginBottom: 8,
  },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.background,
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.ink,
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.hairline,
  },
  phoneInput: { flex: 1, fontSize: 16, color: theme.ink, letterSpacing: 0.4 },
  helperText: { fontSize: 12.5, color: theme.inkSoft, marginTop: 8 },
  errorText: { fontSize: 12.5, color: theme.danger, marginTop: 8 },
  payBtn: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.ink,
    marginTop: 22,
  },
  payBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
