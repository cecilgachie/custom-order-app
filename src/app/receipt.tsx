import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Download, Receipt, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { useAppToast } from "../context/ToastContext";
import { maskPhone } from "../lib/mpesa";
import { sharePdf } from "../lib/pdf";
import { supabase } from "../lib/supabase";

type PaymentRow = {
  id: string;
  user_id: string;
  order_ids: string[];
  phone: string;
  amount: number;
  status: string;
  purpose: "Checkout" | "Balance";
  method?: "M-Pesa" | "Cash";
  mpesa_receipt?: string | null;
  receipt_number?: string | null;
  created_at: string;
};
type OrderRow = {
  id: string;
  order_number?: string | null;
  cake_title: string;
  flavor?: string | null;
  cake_size?: string | null;
  total_weight_kg?: number | null;
  total_price: number;
  amount_paid?: number | null;
  payment_type: "Full" | "Deposit";
  event_date?: string | null;
};

/* ---------- helpers ---------- */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What this payment covered for one order. */
const paidInThisPayment = (o: OrderRow, purpose: PaymentRow["purpose"]) => {
  const total = Math.round(Number(o.total_price) || 0);
  const deposit = Math.ceil(total / 2);
  if (purpose === "Balance") return total - deposit;
  return o.payment_type === "Deposit" ? deposit : total;
};
const balanceNow = (o: OrderRow) =>
  Math.max(0, Math.round(Number(o.total_price) || 0) - (Number(o.amount_paid) || 0));

const specsOf = (o: OrderRow) =>
  [o.flavor, o.cake_size ? `${o.cake_size} size` : null, o.total_weight_kg ? `${o.total_weight_kg} kg` : null]
    .filter(Boolean)
    .join(", ");

function buildReceiptHtml(p: PaymentRow, orders: OrderRow[]) {
  const orderValue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const balance = orders.reduce((s, o) => s + balanceNow(o), 0);

  const rows = orders
    .map((o) => {
      const left = balanceNow(o);
      return `<tr>
        <td><strong>${escapeHtml(o.cake_title)}</strong><br/>
            <span class="muted">${escapeHtml(o.order_number || "")}${specsOf(o) ? ` &middot; ${escapeHtml(specsOf(o))}` : ""}</span>
            ${o.event_date ? `<br/><span class="muted">Event date: ${escapeHtml(o.event_date)}</span>` : ""}</td>
        <td class="right">${escapeHtml(kes(paidInThisPayment(o, p.purpose)))}
            ${left > 0 ? `<br/><span class="muted">Balance ${escapeHtml(kes(left))}</span>` : ""}</td>
      </tr>`;
    })
    .join("");

  return `<html><head><meta charset="utf-8" /><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1F1612;padding:36px;max-width:640px;margin:0 auto}
    .brand{font-size:22px;font-weight:700;letter-spacing:-0.3px} .tag{color:#B08D57;font-size:12px;letter-spacing:1px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #B08D57;padding-bottom:16px;margin-bottom:20px}
    h1{font-size:15px;margin:0;color:#6B5F57;font-weight:600} .no{font-size:18px;font-weight:700;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:13px} td{padding:10px 0;border-bottom:1px solid #ECE6DD;vertical-align:top}
    .right{text-align:right} .muted{color:#6B5F57;font-size:12px}
    .meta td{border:none;padding:4px 0} .meta td:first-child{color:#6B5F57;width:40%}
    .total{background:#F5EEE2;border-radius:10px;padding:16px;margin:20px 0}
    .total .big{font-size:26px;font-weight:800} .foot{color:#6B5F57;font-size:12px;text-align:center;margin-top:28px}
    h2{font-size:14px;margin:22px 0 4px}
  </style></head><body>
    <div class="top">
      <div><div class="brand">Vatican Cake Point</div><div class="tag">PAYMENT RECEIPT</div></div>
      <div class="right"><h1>Receipt no.</h1><div class="no">${escapeHtml(p.receipt_number || "")}</div></div>
    </div>
    <table class="meta">
      <tr><td>Date</td><td>${escapeHtml(formatDateTime(p.created_at))}</td></tr>
      ${
        p.method === "Cash"
          ? `<tr><td>Payment method</td><td>Cash</td></tr>`
          : `<tr><td>M-Pesa code</td><td>${escapeHtml(p.mpesa_receipt || "")}</td></tr>
      <tr><td>Paid from</td><td>${escapeHtml(maskPhone(p.phone))}</td></tr>`
      }
      <tr><td>Payment for</td><td>${p.purpose === "Balance" ? "Balance payment" : "Order payment"}</td></tr>
    </table>
    <h2>Items</h2>
    <table>${rows}</table>
    <div class="total">
      <div class="muted">Amount paid</div><div class="big">${escapeHtml(kes(p.amount))}</div>
      <div class="muted" style="margin-top:8px">Order value ${escapeHtml(kes(orderValue))}${
        balance > 0 ? `, balance due at delivery ${escapeHtml(kes(balance))}` : ", fully paid"
      }</div>
    </div>
    <div class="foot">Thank you for choosing Vatican Cake Point. Keep this receipt and quote your order number when you collect.</div>
  </body></html>`;
}

/* ---------- screen ---------- */
export default function ReceiptScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useAppToast();
  const params = useLocalSearchParams<{ paymentId?: string; orderId?: string }>();
  const paymentId = Array.isArray(params.paymentId) ? params.paymentId[0] : params.paymentId;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from("payments").select("*");
      if (paymentId) query = query.eq("id", paymentId);
      else if (orderId) query = query.contains("order_ids", [orderId]).eq("status", "Success").order("created_at", { ascending: false }).limit(1);
      else throw new Error("No receipt selected.");

      const { data, error: payError } = await query.maybeSingle();
      if (payError) throw payError;
      if (!data) throw new Error("We could not find that payment.");
      setPayment(data as PaymentRow);

      const { data: rows, error: orderError } = await supabase
        .from("cake_orders")
        .select("id, order_number, cake_title, flavor, cake_size, total_weight_kg, total_price, amount_paid, payment_type, event_date")
        .in("id", (data as PaymentRow).order_ids);
      if (orderError) throw orderError;
      setOrders((rows as OrderRow[]) || []);
    } catch (e: any) {
      setError(e?.message || "Could not load this receipt.");
    } finally {
      setLoading(false);
    }
  }, [paymentId, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadPdf = async () => {
    if (!payment || downloading) return;
    setDownloading(true);
    try {
      const html = buildReceiptHtml(payment, orders);
      const ok = await sharePdf(html, {
        filename: `Vatican-Receipt-${payment.receipt_number ?? payment.id}`,
        dialogTitle: `Receipt ${payment.receipt_number ?? ""}`.trim(),
      });
      if (!ok) showToast("Sharing is not available on this device.", { type: "error" });
    } catch (e: any) {
      showToast(e?.message || "Could not create the receipt PDF.", { type: "error" });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  if (error || !payment) {
    return (
      <View style={styles.center}>
        <XCircle size={40} color={Colors.danger} strokeWidth={1.5} />
        <Text style={styles.stateTitle}>Receipt unavailable</Text>
        <Text style={styles.stateText}>{error || "Something went wrong."}</Text>
        <Pressable style={styles.secondaryBtn} onPress={load}>
          <Text style={styles.secondaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (payment.status !== "Success") {
    return (
      <View style={styles.center}>
        <XCircle size={40} color={Colors.inkMuted} strokeWidth={1.5} />
        <Text style={styles.stateTitle}>No receipt yet</Text>
        <Text style={styles.stateText}>
          {payment.status === "Pending"
            ? "This payment is still waiting for M-Pesa confirmation."
            : "This payment did not go through, so no receipt was issued."}
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(tabs)/orders")}>
          <Text style={styles.secondaryText}>Go to my orders</Text>
        </Pressable>
      </View>
    );
  }

  const orderValue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const balance = orders.reduce((s, o) => s + balanceNow(o), 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {/* Success header */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <CheckCircle2 size={34} color={Colors.successGreen} strokeWidth={1.75} />
          </View>
          <Text style={styles.heroTitle}>Payment received</Text>
          <Text style={styles.heroAmount}>{kes(payment.amount)}</Text>
        </View>

        {/* Receipt details */}
        <View style={styles.card}>
          <Row label="Receipt no." value={payment.receipt_number || "Pending"} strong />
          {payment.method === "Cash" ? (
            <Row label="Payment method" value="Cash" />
          ) : (
            <Row label="M-Pesa code" value={payment.mpesa_receipt || ""} />
          )}
          <Row label="Date" value={formatDateTime(payment.created_at)} />
          {payment.method !== "Cash" && <Row label="Paid from" value={maskPhone(payment.phone)} />}
          <Row label="Payment for" value={payment.purpose === "Balance" ? "Balance payment" : "Order payment"} last />
        </View>

        {/* Items with their unique order numbers */}
        <Text style={styles.sectionLabel}>Items</Text>
        <View style={styles.card}>
          {orders.map((o, i) => {
            const left = balanceNow(o);
            return (
              <View key={o.id} style={[styles.item, i === orders.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.itemTitle}>{o.cake_title}</Text>
                  <Text style={styles.orderNo}>{o.order_number}</Text>
                  {!!specsOf(o) && <Text style={styles.itemSpecs}>{specsOf(o)}</Text>}
                  {!!o.event_date && <Text style={styles.itemSpecs}>Event date: {o.event_date}</Text>}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.itemPaid}>{kes(paidInThisPayment(o, payment.purpose))}</Text>
                  {left > 0 && <Text style={styles.itemBalance}>Balance {kes(left)}</Text>}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order value</Text>
            <Text style={styles.summaryValue}>{kes(orderValue)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Balance due at delivery</Text>
            <Text style={[styles.summaryValue, balance > 0 && { color: Colors.danger }]}>{balance > 0 ? kes(balance) : "None, fully paid"}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          onPress={() => router.replace("/(tabs)/orders")}
          style={({ pressed }) => [styles.secondaryBtn, pressed && { backgroundColor: Colors.goldTint }]}
          accessibilityRole="button"
        >
          <Receipt size={17} color={Colors.ink} strokeWidth={1.75} />
          <Text style={styles.secondaryText}>My orders</Text>
        </Pressable>
        <Pressable
          onPress={downloadPdf}
          disabled={downloading}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }, downloading && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Download receipt as PDF"
        >
          {downloading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Download size={17} color={Colors.gold} strokeWidth={1.9} />
              <Text style={styles.primaryText}>Download PDF</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontWeight: "800", letterSpacing: 0.3 }]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: Colors.background, gap: 10 },
  stateTitle: { fontSize: 18, fontWeight: "700", color: Colors.ink, marginTop: 6 },
  stateText: { fontSize: 14, color: Colors.inkSoft, textAlign: "center", lineHeight: 21 },
  scroll: { padding: 20 },

  hero: { alignItems: "center", marginBottom: 22, marginTop: 4 },
  heroIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.successTint, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  heroTitle: { fontSize: 15, color: Colors.inkSoft, fontWeight: "600" },
  heroAmount: { fontSize: 34, fontWeight: "800", color: Colors.ink, letterSpacing: -0.8, marginTop: 4 },

  card: { backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.hairline },
  rowLabel: { fontSize: 14, color: Colors.inkSoft },
  rowValue: { fontSize: 14, fontWeight: "600", color: Colors.ink, maxWidth: "62%", textAlign: "right" },

  sectionLabel: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginTop: 24, marginBottom: 10, marginLeft: 2 },
  item: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.hairline },
  itemTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  orderNo: { fontSize: 12.5, fontWeight: "700", color: Colors.gold, marginTop: 3, letterSpacing: 0.4 },
  itemSpecs: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 2 },
  itemPaid: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  itemBalance: { fontSize: 12, color: Colors.inkSoft, marginTop: 3 },

  summary: { backgroundColor: Colors.goldTint, borderRadius: 16, padding: 16, marginTop: 16, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13.5, color: Colors.inkSoft },
  summaryValue: { fontSize: 13.5, fontWeight: "700", color: Colors.ink },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline,
  },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, paddingHorizontal: 18,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.hairline, backgroundColor: Colors.surface,
  },
  secondaryText: { fontSize: 15, fontWeight: "600", color: Colors.ink },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 16, backgroundColor: Colors.ink },
  primaryText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});