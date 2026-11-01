import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import { CalendarDays, Cake, Download, Heart, Layers, Receipt, TrendingUp } from "lucide-react-native";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Types + helpers                                                     */
/* ------------------------------------------------------------------ */
type OrderRow = {
  id: string;
  order_number?: string | null;
  cake_title: string;
  flavor?: string | null;
  cake_size?: string | null;
  total_price: number | string;
  amount_paid?: number | null;
  payment_status: string;
  order_status?: string | null;
  event_date?: string | null;
  created_at: string;
};

const RANGES = [
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "12M", months: 12 },
  { key: "All", months: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SIZES = ["Small", "Medium", "Large"] as const;
const BAR_AREA = 110;

const pad = (n: number) => String(n).padStart(2, "0");
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const compactKes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const formatEvent = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
};

/** Money actually paid on an order. */
const paidOf = (o: OrderRow) => {
  if (o.amount_paid != null && Number(o.amount_paid) > 0) return Number(o.amount_paid);
  const total = Number(o.total_price) || 0;
  if (o.payment_status === "Paid") return total;
  if (o.payment_status === "Deposit Paid") return Math.ceil(total / 2);
  return 0;
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("6M");
  const [picked, setPicked] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setLoadError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cake_orders")
        .select("id, order_number, cake_title, flavor, cake_size, total_price, amount_paid, payment_status, order_status, event_date, created_at")
        .eq("user_id", user.id);
      if (error) throw error;
      setOrders((data as OrderRow[]) || []);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load your analytics.");
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

  /* ---------- calculations ---------- */
  const data = useMemo(() => {
    const placed = orders.filter((o) => o.payment_status !== "Unpaid" && o.order_status !== "Cancelled");
    const rangeMonths = RANGES.find((r) => r.key === range)!.months;
    const now = new Date();
    const chartMonths = rangeMonths || 12;
    const start = new Date(now.getFullYear(), now.getMonth() - (chartMonths - 1), 1);

    const inRange = rangeMonths === 0 ? placed : placed.filter((o) => new Date(o.created_at) >= start);

    // Monthly spend series
    const series = Array.from({ length: chartMonths }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      return { key: monthKey(d), label: MONTHS[d.getMonth()], value: 0 };
    });
    const index = new Map(series.map((s, i) => [s.key, i]));
    inRange.forEach((o) => {
      const i = index.get(monthKey(new Date(o.created_at)));
      if (i !== undefined) series[i].value += paidOf(o);
    });
    const maxValue = Math.max(1, ...series.map((s) => s.value));

    const invested = inRange.reduce((s, o) => s + paidOf(o), 0);
    const orderValue = inRange.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const avgOrder = inRange.length ? orderValue / inRange.length : 0;

    // Flavors
    const flavorCount = new Map<string, number>();
    inRange.forEach((o) => {
      const f = o.flavor?.trim() ? titleCase(o.flavor) : "Unspecified";
      flavorCount.set(f, (flavorCount.get(f) ?? 0) + 1);
    });
    const flavors = Array.from(flavorCount.entries())
      .map(([name, count]) => ({ name, count, pct: inRange.length ? Math.round((count / inRange.length) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    // Sizes
    const sizeCount: Record<string, number> = { Small: 0, Medium: 0, Large: 0 };
    inRange.forEach((o) => {
      if (o.cake_size && o.cake_size in sizeCount) sizeCount[o.cake_size] += 1;
    });
    const sizeTotal = SIZES.reduce((s, k) => s + sizeCount[k], 0);

    // Upcoming events (all time, not range-bound)
    const today = todayISO();
    const upcoming = placed
      .filter((o) => o.event_date && o.event_date >= today && o.order_status !== "Delivered")
      .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

    const outstanding = placed.reduce((s, o) => s + Math.max(0, (Number(o.total_price) || 0) - paidOf(o)), 0);

    return { series, maxValue, invested, avgOrder, count: inRange.length, flavors, sizeCount, sizeTotal, upcoming, outstanding };
  }, [orders, range]);

  const selected = picked !== null && picked < data.series.length ? picked : data.series.length - 1;
  const selectedPoint = data.series[selected];

  /* ---------- PDF ---------- */
  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const generated = `${new Date().getDate()} ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`;
      const bars = data.series
        .map(
          (s) => `<tr><td style="width:46px">${escapeHtml(s.label)}</td>
            <td><div style="background:#F5EEE2;border-radius:4px;height:14px"><div style="background:#B08D57;border-radius:4px;height:14px;width:${Math.round((s.value / data.maxValue) * 100)}%"></div></div></td>
            <td class="right" style="width:110px">${escapeHtml(kes(s.value))}</td></tr>`
        )
        .join("");
      const flavorRows = data.flavors
        .slice(0, 8)
        .map((f) => `<tr><td>${escapeHtml(f.name)}</td><td class="right">${f.count} order${f.count === 1 ? "" : "s"}</td><td class="right">${f.pct}%</td></tr>`)
        .join("");
      const upcomingRows = data.upcoming
        .slice(0, 8)
        .map((o) => `<tr><td>${escapeHtml(o.cake_title)}<br/><span class="muted">${escapeHtml(o.order_number || "")}</span></td><td class="right">${escapeHtml(formatEvent(o.event_date!))}</td></tr>`)
        .join("");

      const html = `<html><head><meta charset="utf-8" /><style>
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1F1612;padding:36px;max-width:680px;margin:0 auto}
        .brand{font-size:22px;font-weight:700} .tag{color:#B08D57;font-size:12px;letter-spacing:1px}
        .head{border-bottom:2px solid #B08D57;padding-bottom:14px;margin-bottom:22px}
        h2{font-size:15px;margin:26px 0 8px} table{width:100%;border-collapse:collapse;font-size:13px}
        td{padding:8px 0;border-bottom:1px solid #ECE6DD;vertical-align:middle} .right{text-align:right} .muted{color:#6B5F57;font-size:12px}
        .grid{display:flex;gap:12px} .box{flex:1;background:#F5EEE2;border-radius:10px;padding:14px}
        .box .v{font-size:20px;font-weight:800;margin-top:4px} .box .l{color:#6B5F57;font-size:12px}
      </style></head><body>
        <div class="head"><div class="brand">Vatican Cake Point</div><div class="tag">MY CAKE ANALYTICS</div>
          <div class="muted" style="margin-top:6px">Generated ${escapeHtml(generated)}, range: ${escapeHtml(range === "All" ? "all time" : `last ${range}`)}</div></div>
        <div class="grid">
          <div class="box"><div class="l">Total invested</div><div class="v">${escapeHtml(kes(data.invested))}</div></div>
          <div class="box"><div class="l">Cakes ordered</div><div class="v">${data.count}</div></div>
          <div class="box"><div class="l">Average order</div><div class="v">${escapeHtml(kes(data.avgOrder))}</div></div>
        </div>
        <h2>Spending by month</h2><table>${bars}</table>
        <h2>Flavors you order</h2><table>${flavorRows || '<tr><td>No orders in this range.</td></tr>'}</table>
        <h2>Upcoming events</h2><table>${upcomingRows || '<tr><td>No upcoming events.</td></tr>'}</table>
        ${data.outstanding > 0 ? `<p class="muted" style="margin-top:20px">Outstanding balance across your orders: <strong>${escapeHtml(kes(data.outstanding))}</strong></p>` : ""}
      </body></html>`;

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
      if (!(await Sharing.isAvailableAsync())) {
        showToast("Sharing is not available on this device.", { type: "error" });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "My cake analytics" });
    } catch (e: any) {
      showToast(e?.message || "Could not create the PDF.", { type: "error" });
    } finally {
      setExporting(false);
    }
  };

  /* ---------- render ---------- */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Compiling your cake metrics…</Text>
      </View>
    );
  }

  const topFlavor = data.flavors[0];
  const next = data.upcoming[0];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.gold} colors={[Colors.gold]} />}
      >
        {!!loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={() => load(true)} hitSlop={8}>
              <Text style={styles.errorAction}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Range */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => {
                  setRange(r.key);
                  setPicked(null);
                }}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{r.key}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hero: total + interactive monthly chart */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Total invested</Text>
          <Text style={styles.heroValue}>{kes(data.invested)}</Text>
          <Text style={styles.heroSub}>
            {selectedPoint ? `${selectedPoint.label}: ${kes(selectedPoint.value)}` : ""}
          </Text>

          <View style={styles.chart}>
            {data.series.map((s, i) => {
              const h = Math.max(s.value > 0 ? 6 : 3, (s.value / data.maxValue) * BAR_AREA);
              const isSel = i === selected;
              return (
                <Pressable key={s.key} onPress={() => setPicked(i)} style={styles.barCol} accessibilityLabel={`${s.label}, ${kes(s.value)}`}>
                  <Text style={[styles.barTop, !isSel && { opacity: 0 }]}>{s.value > 0 ? compactKes(s.value) : ""}</Text>
                  <View style={[styles.bar, { height: h }, isSel ? styles.barOn : styles.barOff]} />
                  <Text style={[styles.barLabel, isSel && { color: "#FFF" }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Stat tiles */}
        <View style={styles.tiles}>
          <Tile icon={<Cake size={18} color={Colors.gold} strokeWidth={1.75} />} label="Cakes ordered" value={String(data.count)} />
          <Tile icon={<Receipt size={18} color={Colors.gold} strokeWidth={1.75} />} label="Average order" value={kes(data.avgOrder)} />
          <Tile icon={<Heart size={18} color={Colors.gold} strokeWidth={1.75} />} label="Favourite flavor" value={topFlavor?.name ?? "None yet"} small />
          <Tile
            icon={<TrendingUp size={18} color={data.outstanding > 0 ? Colors.danger : Colors.gold} strokeWidth={1.75} />}
            label="Balance outstanding"
            value={kes(data.outstanding)}
          />
        </View>

        {/* Flavors */}
        <Text style={styles.sectionTitle}>Flavor breakdown</Text>
        <View style={styles.card}>
          {data.flavors.length === 0 ? (
            <Text style={styles.empty}>No paid orders in this range yet.</Text>
          ) : (
            data.flavors.slice(0, 5).map((f, i, arr) => (
              <View key={f.name} style={[styles.flavorRow, i === arr.length - 1 && { marginBottom: 0 }]}>
                <View style={styles.flavorTop}>
                  <Text style={styles.flavorName}>{f.name}</Text>
                  <Text style={styles.flavorPct}>
                    {f.count} {f.count === 1 ? "order" : "orders"}, {f.pct}%
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(4, f.pct)}%` }]} />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Sizes */}
        <Text style={styles.sectionTitle}>Your usual size</Text>
        <View style={styles.card}>
          {data.sizeTotal === 0 ? (
            <Text style={styles.empty}>No size data yet.</Text>
          ) : (
            <>
              <View style={styles.stack}>
                {SIZES.map((s, i) => {
                  const count = data.sizeCount[s];
                  if (!count) return null;
                  return <View key={s} style={{ flex: count, backgroundColor: [Colors.goldTint, Colors.gold, Colors.ink][i], height: 14 }} />;
                })}
              </View>
              <View style={styles.legend}>
                {SIZES.map((s, i) => (
                  <View key={s} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: [Colors.goldTint, Colors.gold, Colors.ink][i] }]} />
                    <Layers size={13} color={Colors.inkMuted} />
                    <Text style={styles.legendText}>
                      {s} {data.sizeCount[s]}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Upcoming */}
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        {next ? (
          <View style={styles.card}>
            {data.upcoming.slice(0, 3).map((o, i, arr) => {
              const d = daysUntil(o.event_date!);
              return (
                <View key={o.id} style={[styles.eventRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventDays}>{d}</Text>
                    <Text style={styles.eventUnit}>{d === 1 ? "day" : "days"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{o.cake_title}</Text>
                    <Text style={styles.eventMeta}>
                      {formatEvent(o.event_date!)}
                      {o.order_number ? `, ${o.order_number}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.card, styles.noEvents]}>
            <CalendarDays size={22} color={Colors.inkMuted} strokeWidth={1.5} />
            <Text style={styles.empty}>No upcoming events. Order a cake to plan your next celebration.</Text>
          </View>
        )}
      </ScrollView>

      {/* PDF action */}
      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Pressable
          onPress={downloadPdf}
          disabled={exporting}
          style={({ pressed }) => [styles.pdfBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }, exporting && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Download analytics as PDF"
        >
          {exporting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Download size={18} color={Colors.gold} strokeWidth={1.9} />
              <Text style={styles.pdfText}>Download PDF report</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Tile({ icon, label, value, small }: { icon: ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={[styles.tileValue, small && { fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
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
  scroll: { padding: 16 },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.dangerTint, borderWidth: 1, borderColor: Colors.dangerBorder, borderRadius: 14, padding: 14, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, color: Colors.danger, lineHeight: 19 },
  errorAction: { fontSize: 14, fontWeight: "700", color: Colors.danger },

  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  rangeChip: { paddingHorizontal: 16, height: 36, justifyContent: "center", borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline },
  rangeChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  rangeText: { fontSize: 13.5, fontWeight: "600", color: Colors.inkSoft },
  rangeTextActive: { color: Colors.gold },

  hero: { backgroundColor: Colors.ink, borderRadius: 24, padding: 20, paddingBottom: 16 },
  heroLabel: { fontSize: 13, color: "rgba(255,255,255,0.65)" },
  heroValue: { fontSize: 32, fontWeight: "800", color: "#FFF", letterSpacing: -0.8, marginTop: 4 },
  heroSub: { fontSize: 13, color: Colors.gold, marginTop: 4, minHeight: 18 },
  chart: { flexDirection: "row", alignItems: "flex-end", marginTop: 14, gap: 4 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: BAR_AREA + 44 },
  barTop: { fontSize: 11, fontWeight: "700", color: Colors.gold, marginBottom: 4 },
  bar: { width: "78%", maxWidth: 28, borderRadius: 6 },
  barOn: { backgroundColor: Colors.gold },
  barOff: { backgroundColor: "rgba(255,255,255,0.18)" },
  barLabel: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 8 },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  tile: { width: "47.8%", flexGrow: 1, backgroundColor: Colors.surface, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  tileIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  tileValue: { fontSize: 19, fontWeight: "800", color: Colors.ink, letterSpacing: -0.3 },
  tileLabel: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 3 },

  sectionTitle: { fontSize: 17, fontWeight: "700", color: Colors.ink, marginTop: 26, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  empty: { fontSize: 14, color: Colors.inkSoft, lineHeight: 21, flexShrink: 1 },

  flavorRow: { marginBottom: 16 },
  flavorTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  flavorName: { fontSize: 14.5, fontWeight: "600", color: Colors.ink },
  flavorPct: { fontSize: 12.5, color: Colors.inkSoft },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.goldTint, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.gold },

  stack: { flexDirection: "row", borderRadius: 7, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  legendText: { fontSize: 13, color: Colors.inkSoft },

  eventRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.hairline },
  eventBadge: { width: 54, height: 54, borderRadius: 16, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center" },
  eventDays: { fontSize: 19, fontWeight: "800", color: Colors.ink },
  eventUnit: { fontSize: 11, color: Colors.inkSoft, marginTop: -2 },
  eventTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink },
  eventMeta: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 3 },
  noEvents: { flexDirection: "row", alignItems: "center", gap: 12 },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline,
  },
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16, backgroundColor: Colors.ink },
  pdfText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});