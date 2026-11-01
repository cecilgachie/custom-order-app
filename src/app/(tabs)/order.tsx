import { useFocusEffect, useRouter } from "expo-router";
import { BarChart3, CalendarDays, Package, Receipt } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MpesaPaySheet from "../../components/MpesaPaySheet";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { requestStkPush, waitForPayment } from "../../lib/mpesa";
import { supabase } from "../../lib/supabase";

/**
 * Stages an order moves through. Edit this list to match the order_status
 * values your admin workflow really uses (the database trigger that sends
 * notifications uses the same names).
 */
const ORDER_STAGES = ["Pending Review", "Confirmed", "Baking", "Ready", "Delivered"];
const STAGE_LABEL: Record<string, string> = { "Pending Review": "In review" };

type Order = {
  id: string;
  order_number?: string | null;
  cake_title: string;
  flavor?: string | null;
  cake_size?: string | null;
  total_weight_kg?: number | null;
  total_price: number | string;
  amount_paid?: number | null;
  payment_status: string;
  order_status?: string | null;
  event_date?: string | null;
  created_at?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const formatEventDate = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
};
const totalOf = (o: Order) => Math.round(Number(o.total_price) || 0);
const paidOf = (o: Order) => Number(o.amount_paid) || 0;
const balanceOf = (o: Order) => Math.max(0, totalOf(o) - paidOf(o));
const isCompleted = (o: Order) => o.order_status === "Delivered" || o.order_status === "Cancelled";

const PAYMENT_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  Paid: { bg: Colors.successTint, fg: Colors.successGreen, label: "Paid in full" },
  "Deposit Paid": { bg: Colors.goldTint, fg: "#8A6A33", label: "Deposit paid" },
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useAppToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<"Active" | "Completed">("Active");
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [awaitingId, setAwaitingId] = useState<string | null>(null);

  const token = useRef({ cancelled: false });
  useEffect(() => {
    token.current.cancelled = false;
    return () => {
      token.current.cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (mode: "silent" | "refresh" = "silent") => {
      if (mode === "refresh") setRefreshing(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }
        const { data, error } = await supabase
          .from("cake_orders")
          .select("*")
          .eq("user_id", user.id)
          .neq("payment_status", "Unpaid") // unpaid items are still in the cart
          .order("created_at", { ascending: false });
        if (error) throw error;
        setOrders((data as Order[]) || []);
      } catch (e: any) {
        showToast(e?.message || "Could not load your orders.", { type: "error" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Refresh whenever the tab is opened, so stage changes appear without a restart
  useFocusEffect(
    useCallback(() => {
      load("silent");
    }, [load])
  );

  const visible = useMemo(
    () => orders.filter((o) => (segment === "Active" ? !isCompleted(o) : isCompleted(o))),
    [orders, segment]
  );
  const activeCount = useMemo(() => orders.filter((o) => !isCompleted(o)).length, [orders]);
  const totalBalance = useMemo(
    () => orders.filter((o) => o.order_status !== "Cancelled").reduce((s, o) => s + balanceOf(o), 0),
    [orders]
  );

  /* ---------- balance payment ---------- */
  const trackPayment = async (paymentId: string, orderId: string) => {
    setAwaitingId(orderId);
    const outcome = await waitForPayment(paymentId, { token: token.current });
    if (token.current.cancelled) return;
    setAwaitingId(null);
    await load("silent");

    if (!outcome) {
      showToast("Still waiting for M-Pesa. If you were charged, pull down to refresh in a minute.", { type: "info" });
    } else if (outcome.status === "Success") {
      router.push({ pathname: "/receipt", params: { paymentId } });
    } else if (outcome.status === "Cancelled") {
      showToast("Payment was cancelled. Nothing was charged.", { type: "info" });
    } else {
      showToast(outcome.result_desc || "The payment did not go through.", { type: "error" });
    }
  };

  const submitBalance = async (msisdn: string) => {
    if (!payingOrder) return;
    const order = payingOrder;
    const { paymentId } = await requestStkPush({
      phone: msisdn,
      orderIds: [order.id],
      amount: balanceOf(order),
      purpose: "Balance",
    });
    setPayingOrder(null);
    showToast("Check your phone and enter your M-Pesa PIN 📱", { type: "info" });
    trackPayment(paymentId, order.id); // runs in the background, not awaited
  };

  /* ---------- render ---------- */
  const renderOrder = ({ item }: { item: Order }) => {
    const status = item.order_status || "Pending Review";
    const cancelled = status === "Cancelled";
    const stageIndex = Math.max(0, ORDER_STAGES.indexOf(status));
    const tone = PAYMENT_TONE[item.payment_status] ?? { bg: Colors.goldTint, fg: Colors.inkSoft, label: item.payment_status };
    const balance = balanceOf(item);
    const canPayBalance = item.payment_status === "Deposit Paid" && !cancelled && balance > 0;
    const awaiting = awaitingId === item.id;
    const specs = [item.flavor, item.cake_size ? `${item.cake_size} size` : null, item.total_weight_kg ? `${item.total_weight_kg} kg` : null]
      .filter(Boolean)
      .join(", ");

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.orderNo}>{item.order_number || "Order"}</Text>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>

        <Text style={styles.title}>{item.cake_title}</Text>
        {!!specs && <Text style={styles.specs}>{specs}</Text>}
        {!!item.event_date && (
          <View style={styles.eventRow}>
            <CalendarDays size={14} color={Colors.inkMuted} strokeWidth={1.75} />
            <Text style={styles.eventText}>Needed on {formatEventDate(item.event_date)}</Text>
          </View>
        )}

        {/* Progress */}
        {cancelled ? (
          <View style={[styles.stageNote, { backgroundColor: Colors.dangerTint }]}>
            <Text style={[styles.stageNoteText, { color: Colors.danger }]}>This order was cancelled.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            <View style={styles.segments}>
              {ORDER_STAGES.map((stage, i) => (
                <View key={stage} style={[styles.segmentBar, i <= stageIndex && styles.segmentBarOn]} />
              ))}
            </View>
            <Text style={styles.stageText}>
              {STAGE_LABEL[status] ?? status}
              <Text style={styles.stageStep}>{`   Step ${stageIndex + 1} of ${ORDER_STAGES.length}`}</Text>
            </Text>
          </View>
        )}

        {/* Money */}
        <View style={styles.moneyRow}>
          <View>
            <Text style={styles.moneyLabel}>Paid</Text>
            <Text style={styles.moneyValue}>{kes(paidOf(item))}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.moneyLabel}>Total</Text>
            <Text style={styles.moneyValue}>{kes(totalOf(item))}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.moneyLabel}>Balance</Text>
            <Text style={[styles.moneyValue, balance > 0 && !cancelled && { color: Colors.danger }]}>{kes(cancelled ? 0 : balance)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {paidOf(item) > 0 && (
            <Pressable
              onPress={() => router.push({ pathname: "/receipt", params: { orderId: item.id } })}
              style={({ pressed }) => [styles.ghostBtn, pressed && { backgroundColor: Colors.goldTint }]}
              accessibilityRole="button"
              accessibilityLabel={`Receipt for ${item.cake_title}`}
            >
              <Receipt size={16} color={Colors.ink} strokeWidth={1.75} />
              <Text style={styles.ghostText}>Receipt</Text>
            </Pressable>
          )}
          {canPayBalance && (
            <Pressable
              onPress={() => setPayingOrder(item)}
              disabled={awaiting}
              style={({ pressed }) => [styles.solidBtn, pressed && { opacity: 0.9 }, awaiting && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              {awaiting ? (
                <>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.solidText}>Waiting for M-Pesa…</Text>
                </>
              ) : (
                <Text style={styles.solidText}>Pay balance {kes(balance)}</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading your orders…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSub}>
            {activeCount === 0 ? "No active orders" : `${activeCount} active`}
            {totalBalance > 0 ? `, ${kes(totalBalance)} balance outstanding` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/profile/analytics")}
          style={({ pressed }) => [styles.insightBtn, pressed && { backgroundColor: Colors.goldTint }]}
          accessibilityRole="button"
          accessibilityLabel="Open my analytics"
        >
          <BarChart3 size={20} color={Colors.ink} strokeWidth={1.75} />
        </Pressable>
      </View>

      <View style={styles.segmentRow}>
        {(["Active", "Completed"] as const).map((s) => {
          const active = segment === s;
          return (
            <Pressable key={s} onPress={() => setSegment(s)} style={[styles.segmentBtn, active && styles.segmentBtnActive]} accessibilityState={{ selected: active }}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(o) => String(o.id)}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} tintColor={Colors.gold} colors={[Colors.gold]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Package size={32} color={Colors.gold} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>{segment === "Active" ? "No active orders" : "No completed orders yet"}</Text>
            <Text style={styles.emptyText}>
              {segment === "Active" ? "Once you pay for a cake it appears here, with live progress." : "Delivered orders will be kept here."}
            </Text>
            {segment === "Active" && (
              <Pressable style={styles.browseBtn} onPress={() => router.replace("/(tabs)")}>
                <Text style={styles.browseText}>Browse cakes</Text>
              </Pressable>
            )}
          </View>
        }
      />

      <MpesaPaySheet
        visible={!!payingOrder}
        title="Pay balance"
        amount={payingOrder ? balanceOf(payingOrder) : 0}
        note={payingOrder ? `Balance for ${payingOrder.order_number ?? payingOrder.cake_title}` : undefined}
        onClose={() => setPayingOrder(null)}
        onSubmit={submitBalance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  loadingText: { marginTop: 12, color: Colors.inkSoft, fontSize: 14 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: Colors.ink, letterSpacing: -0.4 },
  headerSub: { fontSize: 13.5, color: Colors.inkSoft, marginTop: 3 },
  insightBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, justifyContent: "center", alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline,
  },

  segmentRow: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 8, padding: 4, borderRadius: 14,
    backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline,
  },
  segmentBtn: { flex: 1, height: 38, justifyContent: "center", alignItems: "center", borderRadius: 11 },
  segmentBtnActive: { backgroundColor: Colors.ink },
  segmentText: { fontSize: 14, fontWeight: "600", color: Colors.inkSoft },
  segmentTextActive: { color: Colors.gold },

  list: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline,
    shadowColor: "#2A1B10", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNo: { fontSize: 12.5, fontWeight: "700", color: Colors.gold, letterSpacing: 0.5 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "700", color: Colors.ink, marginTop: 10, letterSpacing: -0.2 },
  specs: { fontSize: 13, color: Colors.inkSoft, marginTop: 3 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  eventText: { fontSize: 13, color: Colors.inkSoft },

  segments: { flexDirection: "row", gap: 5 },
  segmentBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.goldTint },
  segmentBarOn: { backgroundColor: Colors.gold },
  stageText: { fontSize: 14, fontWeight: "700", color: Colors.ink, marginTop: 10 },
  stageStep: { fontSize: 12.5, fontWeight: "500", color: Colors.inkMuted },
  stageNote: { borderRadius: 12, padding: 12, marginTop: 14 },
  stageNoteText: { fontSize: 13.5, fontWeight: "600" },

  moneyRow: {
    flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline,
  },
  moneyLabel: { fontSize: 12, color: Colors.inkMuted },
  moneyValue: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginTop: 3 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.hairline,
  },
  ghostText: { fontSize: 14.5, fontWeight: "600", color: Colors.ink },
  solidBtn: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", height: 46, borderRadius: 14, backgroundColor: Colors.ink },
  solidText: { color: "#FFF", fontSize: 14.5, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 48, paddingHorizontal: 28 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.ink },
  emptyText: { fontSize: 14, color: Colors.inkSoft, textAlign: "center", marginTop: 6, lineHeight: 21 },
  browseBtn: { backgroundColor: Colors.ink, paddingHorizontal: 24, height: 48, justifyContent: "center", borderRadius: 14, marginTop: 20 },
  browseText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});