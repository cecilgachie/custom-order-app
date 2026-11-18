import { useFocusEffect } from "expo-router";
import { CalendarDays, Inbox, Search, StickyNote, Users, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { displayName } from "../../lib/displayName";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Stages (must match the database function admin_set_order_status)    */
/* ------------------------------------------------------------------ */
const STAGES = ["Pending Review", "Confirmed", "Baking", "Ready", "Delivered"];

const NEXT: Record<string, { to: string; label: string }> = {
  "Pending Review": { to: "Confirmed", label: "Confirm order" },
  Confirmed: { to: "Baking", label: "Start baking" },
  Baking: { to: "Ready", label: "Mark ready" },
  Ready: { to: "Delivered", label: "Mark delivered" },
};

const FILTERS = ["Active", "Pending Review", "Confirmed", "Baking", "Ready", "Delivered", "Cancelled", "All"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Partial<Record<Filter, string>> = { "Pending Review": "In review" };

type Order = {
  id: string;
  user_id: string | null;
  order_number?: string | null;
  cake_title: string;
  flavor?: string | null;
  cake_size?: string | null;
  total_weight_kg?: number | null;
  guest_count?: number | null;
  cake_message?: string | null;
  custom_color_theme?: string | null;
  design_instructions?: string | null;
  event_date?: string | null;
  total_price: number | string;
  amount_paid?: number | null;
  payment_status: string;
  order_status?: string | null;
  created_at?: string | null;
};
type Customer = { full_name?: string | null; username?: string | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const statusOf = (o: Order) => o.order_status || "Pending Review";
const totalOf = (o: Order) => Math.round(Number(o.total_price) || 0);
const paidOf = (o: Order) => Number(o.amount_paid) || 0;
const balanceOf = (o: Order) => Math.max(0, totalOf(o) - paidOf(o));
const isClosed = (o: Order) => statusOf(o) === "Delivered" || statusOf(o) === "Cancelled";

const formatEvent = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
};
const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - today) / 86_400_000);
};

const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) => {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Back", style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
};

const PAYMENT_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  Paid: { bg: Colors.successTint, fg: Colors.successGreen, label: "Paid in full" },
  "Deposit Paid": { bg: Colors.goldTint, fg: "#8A6A33", label: "Deposit paid" },
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function AdminOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("Active");
  const [sortBy, setSortBy] = useState<"event" | "newest">("event");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  /* ---------- data ---------- */
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("cake_orders")
        .select("*")
        .neq("payment_status", "Unpaid") // unpaid items are still in customers' carts
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const rows = (data as Order[]) || [];
      setOrders(rows);

      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: people } = await supabase.from("profiles").select("id, full_name, username").in("id", ids);
        const map: Record<string, Customer> = {};
        (people || []).forEach((p: any) => (map[p.id] = { full_name: p.full_name, username: p.username }));
        setCustomers(map);
      }
    } catch (e: any) {
      setLoadError(e?.message || "Could not load orders. Check that the admin migration has been run.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const customerLabel = useCallback(
    (o: Order) => (!o.user_id ? "Deleted account" : displayName(customers[o.user_id], "Customer")),
    [customers]
  );

  /* ---------- derived ---------- */
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { Active: 0, "Pending Review": 0, Confirmed: 0, Baking: 0, Ready: 0, Delivered: 0, Cancelled: 0, All: orders.length };
    orders.forEach((o) => {
      const s = statusOf(o) as Filter;
      if (s in c) c[s] += 1;
      if (!isClosed(o)) c.Active += 1;
    });
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = orders.filter((o) => {
      if (filter === "Active") return !isClosed(o);
      if (filter === "All") return true;
      return statusOf(o) === filter;
    });
    if (q) {
      list = list.filter((o) =>
        [o.order_number, o.cake_title, o.flavor, customerLabel(o), customers[o.user_id ?? ""]?.username]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === "newest") return (b.created_at || "") < (a.created_at || "") ? -1 : 1;
      // soonest event first, orders without a date last
      const ad = a.event_date || "9999-12-31";
      const bd = b.event_date || "9999-12-31";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
  }, [orders, filter, query, sortBy, customers, customerLabel]);

  /* ---------- actions ---------- */
  const run = async (id: string, work: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await work();
    } catch (e: any) {
      showToast(e?.message || "That did not work. Please try again.", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const setStage = (o: Order, to: string) =>
    run(o.id, async () => {
      const { error } = await supabase.rpc("admin_set_order_status", { p_order_id: o.id, p_status: to });
      if (error) throw error;
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, order_status: to } : x)));
      showToast(`${o.order_number ?? "Order"} moved to ${to}. The customer was notified.`, { type: "success" });
    });

  const advance = (o: Order) => {
    const next = NEXT[statusOf(o)];
    if (!next) return;
    if (next.to === "Delivered") {
      const bal = balanceOf(o);
      if (bal > 0) {
        showToast(`Collect the ${kes(bal)} balance first, then mark delivered.`, { type: "error" });
        return;
      }
      confirmAction("Mark as delivered?", `${o.cake_title} (${o.order_number}) will be closed and the customer notified.`, "Mark delivered", () => setStage(o, next.to));
      return;
    }
    setStage(o, next.to);
  };

  const cancelOrder = (o: Order) => {
    const paid = paidOf(o);
    confirmAction(
      "Cancel this order?",
      paid > 0
        ? `The customer has paid ${kes(paid)}. Refunds are not handled in the app, so arrange it with them separately. The customer will be notified.`
        : "The customer will be notified.",
      "Cancel order",
      () => setStage(o, "Cancelled"),
      true
    );
  };

  const recordCash = (o: Order) => {
    const bal = balanceOf(o);
    confirmAction(
      "Record cash balance?",
      `Confirm you have received ${kes(bal)} in cash for ${o.order_number}. A receipt will be issued to the customer.`,
      "Yes, received",
      () =>
        run(o.id, async () => {
          const { data, error } = await supabase.rpc("admin_record_cash_payment", { p_order_id: o.id });
          if (error) throw error;
          showToast(`Cash recorded. Receipt ${data ?? ""} issued.`, { type: "success" });
          await load();
        })
    );
  };

  /* ---------- render ---------- */
  const renderOrder = ({ item: o }: { item: Order }) => {
    const status = statusOf(o);
    const cancelled = status === "Cancelled";
    const closed = isClosed(o);
    const stageIndex = Math.max(0, STAGES.indexOf(status));
    const next = NEXT[status];
    const bal = balanceOf(o);
    const tone = PAYMENT_TONE[o.payment_status] ?? { bg: Colors.goldTint, fg: Colors.inkSoft, label: o.payment_status };
    const busy = busyId === o.id;

    const days = o.event_date ? daysUntil(o.event_date) : null;
    const urgent = !closed && days !== null && days <= 1 && STAGES.indexOf(status) < STAGES.indexOf("Ready");
    const dayLabel = days === null ? "" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;

    const specs = [o.flavor, o.cake_size ? `${o.cake_size} size` : null, o.total_weight_kg ? `${o.total_weight_kg} kg` : null].filter(Boolean).join(", ");

    return (
      <View style={[styles.card, urgent && styles.cardUrgent]}>
        <View style={styles.rowBetween}>
          <Text style={styles.orderNo}>{o.order_number || "Order"}</Text>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>

        <Text style={styles.title}>{o.cake_title}</Text>
        {!!specs && <Text style={styles.specs}>{specs}</Text>}
        <Text style={styles.customer}>{customerLabel(o)}</Text>

        {/* Event date + guests */}
        <View style={styles.metaRow}>
          {!!o.event_date && (
            <View style={styles.metaItem}>
              <CalendarDays size={14} color={urgent ? Colors.danger : Colors.inkMuted} strokeWidth={1.75} />
              <Text style={[styles.metaText, urgent && { color: Colors.danger, fontWeight: "700" }]}>
                {formatEvent(o.event_date)}
                {dayLabel ? `, ${dayLabel}` : ""}
              </Text>
            </View>
          )}
          {!!o.guest_count && (
            <View style={styles.metaItem}>
              <Users size={14} color={Colors.inkMuted} strokeWidth={1.75} />
              <Text style={styles.metaText}>{o.guest_count} guests</Text>
            </View>
          )}
        </View>

        {/* What the chef needs to know */}
        {(!!o.cake_message || !!o.design_instructions || !!o.custom_color_theme) && (
          <View style={styles.brief}>
            <StickyNote size={15} color={Colors.gold} strokeWidth={1.75} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              {!!o.cake_message && <Text style={styles.briefText}>Inscription: “{o.cake_message}”</Text>}
              {!!o.custom_color_theme && <Text style={styles.briefText}>Colors: {o.custom_color_theme}</Text>}
              {!!o.design_instructions && <Text style={styles.briefText}>Notes: {o.design_instructions}</Text>}
            </View>
          </View>
        )}

        {/* Stage progress */}
        {cancelled ? (
          <View style={styles.cancelledNote}>
            <Text style={styles.cancelledText}>Cancelled</Text>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <View style={styles.segments}>
              {STAGES.map((s, i) => (
                <View key={s} style={[styles.segmentBar, i <= stageIndex && styles.segmentBarOn]} />
              ))}
            </View>
            <Text style={styles.stageText}>{FILTER_LABEL[status as Filter] ?? status}</Text>
          </View>
        )}

        {/* Money */}
        <View style={styles.moneyRow}>
          <Text style={styles.moneyText}>
            Paid <Text style={styles.moneyStrong}>{kes(paidOf(o))}</Text> of <Text style={styles.moneyStrong}>{kes(totalOf(o))}</Text>
          </Text>
          {bal > 0 && !cancelled && <Text style={[styles.moneyText, { color: Colors.danger, fontWeight: "700" }]}>Balance {kes(bal)}</Text>}
        </View>

        {/* Actions */}
        {!closed && (
          <View style={styles.actions}>
            {next && (
              <Pressable
                onPress={() => advance(o)}
                disabled={busy}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }, busy && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryText}>{next.label}</Text>}
              </Pressable>
            )}
            {o.payment_status === "Deposit Paid" && (
              <Pressable
                onPress={() => recordCash(o)}
                disabled={busy}
                style={({ pressed }) => [styles.ghostBtn, pressed && { backgroundColor: Colors.goldTint }, busy && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <Text style={styles.ghostText}>Cash balance</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => cancelOrder(o)}
              disabled={busy}
              style={({ pressed }) => [styles.ghostBtn, pressed && { backgroundColor: Colors.dangerTint }, busy && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${o.order_number}`}
            >
              <Text style={[styles.ghostText, { color: Colors.danger }]}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading orders…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Orders</Text>
            <Text style={styles.headerSub}>
              {counts.Active} active{counts["Pending Review"] > 0 ? `, ${counts["Pending Review"]} awaiting review` : ""}
            </Text>
          </View>
          <View style={styles.sortToggle}>
            {(["event", "newest"] as const).map((s) => (
              <Pressable key={s} onPress={() => setSortBy(s)} style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]} accessibilityState={{ selected: sortBy === s }}>
                <Text style={[styles.sortText, sortBy === s && styles.sortTextActive]}>{s === "event" ? "Event date" : "Newest"}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.search}>
          <Search size={18} color={Colors.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search order no., cake or customer"
            placeholderTextColor={Colors.inkMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
              <X size={16} color={Colors.inkMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(o) => String(o.id)}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.gold} colors={[Colors.gold]} />}
        ListHeaderComponent={
          <View>
            {!!loadError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{loadError}</Text>
                <Pressable onPress={() => load(true)} hitSlop={8}>
                  <Text style={styles.errorAction}>Retry</Text>
                </Pressable>
              </View>
            )}
            <FlatList
              horizontal
              data={FILTERS as unknown as Filter[]}
              keyExtractor={(f) => f}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              renderItem={({ item: f }) => {
                const active = filter === f;
                return (
                  <Pressable onPress={() => setFilter(f)} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {FILTER_LABEL[f] ?? f} {counts[f]}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Inbox size={34} color={Colors.inkMuted} strokeWidth={1.5} />
            <Text style={styles.emptyText}>{query ? "No orders match your search." : "No orders in this view."}</Text>
          </View>
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  loadingText: { marginTop: 12, color: Colors.inkSoft, fontSize: 14 },

  header: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.hairline },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: Colors.ink, letterSpacing: -0.4 },
  headerSub: { fontSize: 13, color: Colors.inkSoft, marginTop: 2 },
  sortToggle: { flexDirection: "row", backgroundColor: Colors.background, borderRadius: 12, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  sortBtn: { paddingHorizontal: 10, height: 32, justifyContent: "center", borderRadius: 9 },
  sortBtnActive: { backgroundColor: Colors.ink },
  sortText: { fontSize: 12.5, fontWeight: "600", color: Colors.inkSoft },
  sortTextActive: { color: Colors.gold },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  searchInput: { flex: 1, fontSize: 15, color: Colors.ink },

  list: { padding: 16, paddingBottom: 40 },
  filterRow: { gap: 8, paddingBottom: 14 },
  chip: { paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 13.5, fontWeight: "600", color: Colors.inkSoft },
  chipTextActive: { color: Colors.gold },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.dangerTint, borderWidth: 1, borderColor: Colors.dangerBorder, borderRadius: 14, padding: 14, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, color: Colors.danger, lineHeight: 19 },
  errorAction: { fontSize: 14, fontWeight: "700", color: Colors.danger },

  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline,
    shadowColor: "#2A1B10", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardUrgent: { borderColor: Colors.dangerBorder, borderWidth: 1 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNo: { fontSize: 12.5, fontWeight: "700", color: Colors.gold, letterSpacing: 0.5 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "700", color: Colors.ink, marginTop: 10, letterSpacing: -0.2 },
  specs: { fontSize: 13, color: Colors.inkSoft, marginTop: 3 },
  customer: { fontSize: 13.5, fontWeight: "600", color: Colors.ink, marginTop: 8 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, color: Colors.inkSoft },

  brief: { flexDirection: "row", gap: 10, backgroundColor: Colors.goldTint, borderRadius: 12, padding: 12, marginTop: 12 },
  briefText: { fontSize: 13, color: Colors.inkSoft, lineHeight: 19 },

  segments: { flexDirection: "row", gap: 5 },
  segmentBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.goldTint },
  segmentBarOn: { backgroundColor: Colors.gold },
  stageText: { fontSize: 14, fontWeight: "700", color: Colors.ink, marginTop: 9 },
  cancelledNote: { backgroundColor: Colors.dangerTint, borderRadius: 12, padding: 11, marginTop: 14 },
  cancelledText: { fontSize: 13.5, fontWeight: "700", color: Colors.danger },

  moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline },
  moneyText: { fontSize: 13, color: Colors.inkSoft },
  moneyStrong: { fontWeight: "700", color: Colors.ink },

  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  primaryBtn: { flex: 1, height: 46, borderRadius: 14, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center" },
  primaryText: { color: "#FFF", fontSize: 14.5, fontWeight: "700" },
  ghostBtn: { height: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.hairline, justifyContent: "center", alignItems: "center" },
  ghostText: { fontSize: 14, fontWeight: "600", color: Colors.ink },

  empty: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.inkSoft },
});