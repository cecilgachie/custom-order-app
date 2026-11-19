import { BlurView } from "expo-blur";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ChevronRight, ShoppingBag, Smartphone, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EventDateSheet from "../../components/EventDateSheet";
import MpesaPaySheet from "../../components/MpesaPaySheet";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { requestStkPush, waitForPayment } from "../../lib/mpesa";
import { supabase } from "../../lib/supabase";

const theme = {
  background: Colors.background,
  surface: Colors.surface,
  ink: Colors.ink,
  inkSoft: Colors.inkSoft,
  inkMuted: Colors.inkMuted,
  gold: Colors.gold,
  goldTint: Colors.goldTint,
  hairline: Colors.hairline,
  danger: Colors.danger,
  dangerTint: Colors.dangerTint,
};

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
  event_date?: string | null;
  guest_count?: number | null;
  [key: string]: any;
};

/* ------------------------------------------------------------------ */
/* Money helpers (deposit rounds up so every amount is whole KES)      */
/* ------------------------------------------------------------------ */
const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const priceOf = (item: CartItem) => Number(item.total_price) || 0;
const dueNowOf = (item: CartItem) => (item.payment_type === "Deposit" ? Math.ceil(priceOf(item) / 2) : priceOf(item));
const totalsOf = (items: CartItem[]) => {
  const gross = items.reduce((s, i) => s + priceOf(i), 0);
  const now = items.reduce((s, i) => s + dueNowOf(i), 0);
  return { gross, now, later: gross - now };
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatEvent = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : iso;
};

const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n${message}`)) onConfirm();
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
  const [footerHeight, setFooterHeight] = useState(220);

  // Which cakes the customer has UNticked. New cakes start ticked.
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  // Cakes with an M-Pesa prompt in flight (waiting for the customer's PIN)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Cakes in the open checkout sheet (one cake, or all ticked cakes)
  const [checkoutIds, setCheckoutIds] = useState<string[] | null>(null);
  // Which cake's event date is being chosen (cakes added with the quick "+" start with no date)
  const [dateItemId, setDateItemId] = useState<string | null>(null);

  const token = useRef({ cancelled: false });
  useEffect(() => {
    token.current.cancelled = false;
    return () => {
      token.current.cancelled = true;
    };
  }, []);

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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Tabs stay mounted, so refetch every time the cart gains focus
  useFocusEffect(
    useCallback(() => {
      fetchCartItems("silent");
    }, [fetchCartItems])
  );

  /* ---------- selection ---------- */
  const payable = useMemo(() => cartItems.filter((i) => !pendingIds.has(String(i.id))), [cartItems, pendingIds]);
  const selectedItems = useMemo(() => payable.filter((i) => !unselected.has(String(i.id))), [payable, unselected]);
  const allSelected = payable.length > 0 && selectedItems.length === payable.length;

  const toggleSelected = (id: string) =>
    setUnselected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => setUnselected(allSelected ? new Set(payable.map((i) => String(i.id))) : new Set());

  /* ---------- row actions ---------- */
  const removeCartItem = (item: CartItem) => {
    confirmAction("Remove cake", `Remove "${item.cake_title}" from your cart?`, "Remove", async () => {
      const id = String(item.id);
      setRemovingId(id);
      try {
        // .select() returns the deleted rows. Row-level security can reject a
        // delete WITHOUT an error, so an empty result means nothing was removed.
        const { data, error } = await supabase.from("cake_orders").delete().eq("id", item.id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          console.warn("Cart delete removed 0 rows. Run the cart permissions SQL (20261105000000_cart_policies.sql).");
          throw new Error("This cake could not be removed. Please try again or contact support.");
        }
        setCartItems((prev) => prev.filter((i) => String(i.id) !== id));
        showToast("Cake removed from your cart.", { type: "success" });
      } catch (error: any) {
        showToast(error?.message || "Could not remove this cake.", { type: "error" });
      } finally {
        setRemovingId(null);
      }
    });
  };

  // Optimistic update, rolled back if the database did not really change
  const setPaymentType = async (item: CartItem, next: PaymentType) => {
    if (item.payment_type === next || updatingId) return;
    const id = String(item.id);
    const previous = item.payment_type;

    setUpdatingId(id);
    setCartItems((prev) => prev.map((i) => (String(i.id) === id ? { ...i, payment_type: next } : i)));
    try {
      const { data, error } = await supabase.from("cake_orders").update({ payment_type: next }).eq("id", item.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        console.warn("Cart update changed 0 rows. Run the cart permissions SQL (20261105000000_cart_policies.sql).");
        throw new Error("Could not update the payment option. Please try again.");
      }
    } catch (error: any) {
      setCartItems((prev) => prev.map((i) => (String(i.id) === id ? { ...i, payment_type: previous } : i)));
      showToast(error?.message || "Could not update payment option.", { type: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---------- totals ---------- */
  const selectedTotals = useMemo(() => totalsOf(selectedItems), [selectedItems]);
  const missingDateCount = selectedItems.filter((i) => !i.event_date).length;

  /* ---------- checkout ---------- */
  const openCheckout = (ids: string[]) => {
    if (ids.length === 0 || updatingId) return;
    // Every cake needs an event date before it can be paid for: ask for the first missing one
    const missing = cartItems.find((i) => ids.includes(String(i.id)) && !i.event_date);
    if (missing) {
      setDateItemId(String(missing.id));
      return;
    }
    setCheckoutIds(ids);
  };

  const checkoutItems = useMemo(
    () => (checkoutIds ? cartItems.filter((i) => checkoutIds.includes(String(i.id))) : []),
    [cartItems, checkoutIds]
  );
  const checkoutTotals = useMemo(() => totalsOf(checkoutItems), [checkoutItems]);

  const trackPayment = async (paymentId: string, ids: string[]) => {
    const outcome = await waitForPayment(paymentId, { token: token.current });
    if (token.current.cancelled) return;

    setPendingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    await fetchCartItems("silent");

    if (!outcome) {
      showToast("Still waiting for M-Pesa. If you were charged, pull down to refresh in a minute.", { type: "info" });
    } else if (outcome.status === "Success") {
      router.push({ pathname: "/receipt", params: { paymentId } });
    } else if (outcome.status === "Cancelled") {
      showToast("Payment was cancelled. Nothing was charged.", { type: "info" });
    } else if (outcome.status === "Mismatch") {
      showToast("We received a payment with an unexpected amount. Our team will contact you.", { type: "error" });
    } else {
      showToast(outcome.result_desc || "The payment did not go through.", { type: "error" });
    }
  };

  const submitPayment = async (msisdn: string) => {
    const items = checkoutItems;
    if (items.length === 0) throw new Error("Those cakes are no longer in your cart. Pull down to refresh.");

    const ids = items.map((i) => String(i.id));
    const { paymentId } = await requestStkPush({
      phone: msisdn,
      orderIds: items.map((i) => i.id),
      amount: checkoutTotals.now,
      purpose: "Checkout",
    });

    setCheckoutIds(null);
    setPendingIds((prev) => new Set([...prev, ...ids]));
    showToast("Check your phone and enter your M-Pesa PIN 📱", { type: "info" });
    trackPayment(paymentId, ids); // runs in the background, not awaited
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
  const selectedCount = selectedItems.length;

  const renderItem = ({ item }: { item: CartItem }) => {
    const id = String(item.id);
    const isRemoving = removingId === id;
    const isUpdating = updatingId === id;
    const isPending = pendingIds.has(id);
    const isSelected = !isPending && !unselected.has(id);
    const isDeposit = item.payment_type === "Deposit";
    const specs = [item.flavor, item.cake_size ? `${item.cake_size} size` : null, item.total_weight_kg ? `${item.total_weight_kg} kg` : null]
      .filter(Boolean)
      .join(", ");

    return (
      <View style={[styles.itemCard, isRemoving && { opacity: 0.5 }, isSelected && styles.itemCardSelected]}>
        <View style={styles.cardHeaderRow}>
          <Pressable
            onPress={() => toggleSelected(id)}
            disabled={isPending}
            hitSlop={8}
            style={[styles.checkbox, isSelected && styles.checkboxOn, isPending && { opacity: 0.4 }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled: isPending }}
            accessibilityLabel={`Include ${item.cake_title} in payment`}
          >
            {isSelected && <Check size={15} color={theme.gold} strokeWidth={3} />}
          </Pressable>

          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={styles.cakeTitle} numberOfLines={1}>
              {item.cake_title}
            </Text>
            {!!specs && <Text style={styles.cakeSpecs}>{specs}</Text>}
          </View>

          <Pressable
            onPress={() => removeCartItem(item)}
            disabled={isRemoving || isPending}
            hitSlop={10}
            style={({ pressed }) => [styles.trashBtn, pressed && { backgroundColor: theme.dangerTint }, isPending && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.cake_title}`}
          >
            {isRemoving ? <ActivityIndicator size="small" color={theme.danger} /> : <Trash2 size={17} color={theme.danger} strokeWidth={1.75} />}
          </Pressable>
        </View>

        {!!item.cake_message && (
          <View style={styles.msgBubble}>
            <Text style={styles.msgText}>Inscription: “{item.cake_message}”</Text>
          </View>
        )}

        {/* Event date + guests */}
        <Pressable
          onPress={() => setDateItemId(id)}
          disabled={isPending}
          style={({ pressed }) => [styles.dateRow, !item.event_date && styles.dateRowMissing, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={item.event_date ? `Event date ${formatEvent(item.event_date)}. Change` : "Choose the event date"}
        >
          <CalendarDays size={18} color={item.event_date ? theme.gold : theme.danger} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateTitle, !item.event_date && { color: theme.danger }]}>
              {item.event_date ? formatEvent(item.event_date) : "Choose the date you need it"}
            </Text>
            <Text style={styles.dateSub}>
              {item.event_date ? `${item.guest_count || "?"} guests` : "Required before you can pay"}
            </Text>
          </View>
          <Text style={styles.dateLink}>{item.event_date ? "Change" : "Set date"}</Text>
        </Pressable>

        <View style={styles.billingRow}>
          <View>
            <Text style={styles.priceLabel}>{isDeposit ? "Pay now (50%)" : "Pay now"}</Text>
            <Text style={styles.priceAmount}>{formatKes(dueNowOf(item))}</Text>
            <Text style={styles.priceSub}>{isDeposit ? `of ${formatKes(priceOf(item))} total` : "Full amount"}</Text>
          </View>

          <View style={[styles.segment, (isUpdating || isPending) && { opacity: 0.6 }]}>
            {(["Full", "Deposit"] as PaymentType[]).map((type) => {
              const active = item.payment_type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setPaymentType(item, type)}
                  disabled={isPending}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={type === "Full" ? "Pay in full" : "Pay 50 percent deposit"}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{type === "Full" ? "Full" : "50% deposit"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pay for just this cake */}
        {isPending ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={theme.gold} />
            <Text style={styles.pendingText}>Waiting for M-Pesa. Enter your PIN on your phone.</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => openCheckout([id])}
            disabled={!!updatingId}
            style={({ pressed }) => [styles.payOneBtn, pressed && { backgroundColor: theme.goldTint }, !!updatingId && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={`Pay for ${item.cake_title} only`}
          >
            <Smartphone size={16} color={theme.ink} strokeWidth={1.75} />
            <Text style={styles.payOneText}>{item.event_date ? `Pay ${formatKes(dueNowOf(item))} for this cake` : "Choose the date to pay for this cake"}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const header =
    payable.length > 1 ? (
      <Pressable onPress={toggleAll} style={styles.selectAllRow} accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }}>
        <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>{allSelected && <Check size={15} color={theme.gold} strokeWidth={3} />}</View>
        <Text style={styles.selectAllText}>{allSelected ? "Deselect all" : "Select all"}</Text>
        <Text style={styles.selectAllCount}>
          {selectedCount} of {payable.length} selected
        </Text>
      </Pressable>
    ) : null;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>My Cart</Text>
        <Text style={styles.headerSubtitle}>
          {count === 0 ? "Nothing here yet" : `${count} ${count === 1 ? "cake" : "cakes"} in your cart. Pay for one or several.`}
        </Text>
      </View>

      {/* ITEMS */}
      <FlatList
        data={cartItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContainer, { paddingBottom: count > 0 ? footerHeight + 24 : 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchCartItems("refresh")} tintColor={theme.gold} colors={[theme.gold]} />}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <View style={styles.emptyIcon}>
              <ShoppingBag size={34} color={theme.gold} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>Pick a cake from the catalog and it will appear here.</Text>
            <Pressable style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]} onPress={() => router.replace("/(tabs)")} accessibilityRole="button">
              <Text style={styles.browseBtnText}>Browse cakes</Text>
            </Pressable>
          </View>
        }
      />

      {/* FOOTER SUMMARY (for the ticked cakes) */}
      {count > 0 && (
        <BlurView intensity={80} tint="light" style={styles.checkoutFooter} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Selected total ({selectedCount})</Text>
            <Text style={styles.summaryValue}>{formatKes(selectedTotals.gross)}</Text>
          </View>

          {selectedTotals.later > 0 && (
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Balance due at delivery</Text>
              <Text style={styles.summaryValue}>{formatKes(selectedTotals.later)}</Text>
            </View>
          )}

          <View style={[styles.summaryLine, styles.totalDueLine]}>
            <Text style={styles.totalDueLabel}>Due now</Text>
            <Text style={styles.totalDueValue}>{formatKes(selectedTotals.now)}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.checkoutBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
              (selectedCount === 0 || !!updatingId) && { opacity: 0.5 },
            ]}
            onPress={() => openCheckout(selectedItems.map((i) => String(i.id)))}
            disabled={selectedCount === 0 || !!updatingId}
            accessibilityRole="button"
            accessibilityLabel={`Pay for ${selectedCount} selected cakes, ${formatKes(selectedTotals.now)} due now`}
          >
            <Smartphone size={19} color={theme.gold} strokeWidth={1.9} />
            <Text style={styles.checkoutBtnText}>
              {selectedCount === 0
                ? "Select a cake to pay"
                : missingDateCount > 0
                  ? `Choose the event date${missingDateCount > 1 ? "s" : ""} to continue`
                  : `Pay ${selectedCount} ${selectedCount === 1 ? "cake" : "cakes"} with M-Pesa`}
            </Text>
            {selectedCount > 0 && <ChevronRight size={18} color="#FFF" style={{ marginLeft: "auto" }} />}
          </Pressable>
        </BlurView>
      )}

      <EventDateSheet
        visible={dateItemId !== null}
        item={cartItems.find((i) => String(i.id) === dateItemId) ?? null}
        onClose={() => setDateItemId(null)}
        onSaved={(patch) => {
          setCartItems((prev) => prev.map((i) => (String(i.id) === dateItemId ? { ...i, ...patch } : i)));
          setDateItemId(null);
        }}
      />

      <MpesaPaySheet
        visible={checkoutIds !== null}
        title="Pay with M-Pesa"
        amount={checkoutTotals.now}
        note={
          checkoutItems.length === 1
            ? `For ${checkoutItems[0].cake_title}${checkoutTotals.later > 0 ? `. ${formatKes(checkoutTotals.later)} balance is due at delivery.` : ""}`
            : `For ${checkoutItems.length} cakes${checkoutTotals.later > 0 ? `. ${formatKes(checkoutTotals.later)} balance is due at delivery.` : ""}`
        }
        onClose={() => setCheckoutIds(null)}
        onSubmit={submitPayment}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  centerView: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  loadingText: { marginTop: 12, color: theme.inkSoft, fontSize: 14 },

  header: { paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: theme.ink, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 14, color: theme.inkSoft, marginTop: 3 },

  listContainer: { paddingHorizontal: 16, paddingTop: 4 },

  selectAllRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 6 },
  selectAllText: { fontSize: 14.5, fontWeight: "600", color: theme.ink },
  selectAllCount: { marginLeft: "auto", fontSize: 13, color: theme.inkSoft },

  emptyView: { alignItems: "center", marginTop: 56, paddingHorizontal: 24 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: theme.goldTint, justifyContent: "center", alignItems: "center", marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.ink },
  emptyText: { fontSize: 14, color: theme.inkSoft, textAlign: "center", marginTop: 6, lineHeight: 21 },
  browseBtn: { backgroundColor: theme.ink, paddingHorizontal: 24, height: 48, justifyContent: "center", borderRadius: 14, marginTop: 22 },
  browseBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  itemCard: {
    backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: theme.hairline,
    shadowColor: "#2A1B10", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  itemCardSelected: { borderColor: theme.gold },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: theme.inkMuted, justifyContent: "center", alignItems: "center", marginTop: 1 },
  checkboxOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  cakeTitle: { fontSize: 17, fontWeight: "700", color: theme.ink, letterSpacing: -0.2 },
  cakeSpecs: { fontSize: 13, color: theme.inkSoft, marginTop: 3 },
  trashBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  msgBubble: { backgroundColor: theme.goldTint, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginTop: 12 },
  msgText: { fontSize: 13, color: theme.inkSoft, lineHeight: 19 },

  billingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: 14, marginTop: 14,
  },
  priceLabel: { fontSize: 12, color: theme.inkSoft },
  priceAmount: { fontSize: 18, fontWeight: "700", color: theme.ink, marginTop: 2 },
  priceSub: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },

  segment: { flexDirection: "row", backgroundColor: theme.background, borderRadius: 12, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  segmentBtn: { paddingHorizontal: 12, height: 34, justifyContent: "center", borderRadius: 9 },
  segmentBtnActive: { backgroundColor: theme.ink },
  segmentText: { fontSize: 12.5, fontWeight: "600", color: theme.inkSoft },
  segmentTextActive: { color: theme.gold },

  dateRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, backgroundColor: theme.goldTint,
  },
  dateRowMissing: { backgroundColor: theme.dangerTint, borderWidth: 1, borderColor: theme.dangerBorder },
  dateTitle: { fontSize: 14.5, fontWeight: "700", color: theme.ink },
  dateSub: { fontSize: 12.5, color: theme.inkSoft, marginTop: 1 },
  dateLink: { fontSize: 13.5, fontWeight: "700", color: theme.ink, textDecorationLine: "underline" },

  payOneBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 14,
    borderWidth: 1, borderColor: theme.hairline, marginTop: 14,
  },
  payOneText: { fontSize: 14.5, fontWeight: "600", color: theme.ink },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.goldTint, borderRadius: 12, padding: 12, marginTop: 14 },
  pendingText: { flex: 1, fontSize: 13, color: theme.inkSoft, lineHeight: 19 },

  checkoutFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: "hidden", backgroundColor: "rgba(250,248,245,0.75)",
  },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel: { color: theme.inkSoft, fontSize: 14 },
  summaryValue: { fontWeight: "600", fontSize: 14, color: theme.ink },
  totalDueLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: 12, marginTop: 4, marginBottom: 14, alignItems: "baseline" },
  totalDueLabel: { fontWeight: "700", fontSize: 15, color: theme.ink },
  totalDueValue: { fontWeight: "800", fontSize: 21, color: theme.ink, letterSpacing: -0.3 },
  checkoutBtn: { backgroundColor: theme.ink, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, height: 54, borderRadius: 16 },
  checkoutBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});