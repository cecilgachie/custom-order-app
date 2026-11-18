import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  Banknote,
  Download,
  FileText,
  Hourglass,
  Inbox,
  LogOut,
  Users,
  Wallet,
} from "lucide-react-native";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { displayName } from "../../lib/displayName";
import { sharePdf } from "../../lib/pdf";
import { supabase } from "../../lib/supabase";

/* ------------------------------------------------------------------ */
/* Types + constants                                                   */
/* ------------------------------------------------------------------ */
type Status = "Open" | "Investigating" | "Resolved";
const STATUSES: Status[] = ["Open", "Investigating", "Resolved"];
type Filter = "All" | Status;

type Complaint = {
  id: string;
  user_id?: string | null;
  complaint_category: string;
  complaint_body: string;
  resolution_status?: string | null;
  created_at?: string | null;
};
type Customer = { full_name?: string | null; username?: string | null };

const STATUS_TONE: Record<Status, { bg: string; fg: string }> = {
  Open: { bg: Colors.dangerTint, fg: Colors.danger },
  Investigating: { bg: Colors.goldTint, fg: "#8A6A33" },
  Resolved: { bg: Colors.successTint, fg: Colors.successGreen },
};

const statusOf = (c: Complaint): Status =>
  STATUSES.includes(c.resolution_status as Status) ? (c.resolution_status as Status) : "Open";

/* ------------------------------------------------------------------ */
/* Formatting + export helpers                                         */
/* ------------------------------------------------------------------ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fileStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Quote cells, and neutralise spreadsheet formulas (=, +, -, @) typed by customers
const csvCell = (value: string | number) => {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */
function IconButton({
  icon,
  label,
  onPress,
  busy,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed && { backgroundColor: Colors.goldTint },
        (busy || disabled) && { opacity: 0.6 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={Colors.ink} /> : icon}
    </Pressable>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function MasterSystemDashboard() {
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();

  const [totalUsers, setTotalUsers] = useState(0);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [financials, setFinancials] = useState({ revenue: 0, collected: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | "pdf" | "csv">(null);
  const [signingOut, setSigningOut] = useState(false);

  /* ---------- data ---------- */
  const fetchMasterData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setLoadError(null);

    try {
      const [usersRes, ticketsRes, summaryRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("customer_complaints").select("*").order("created_at", { ascending: false }),
        supabase.from("view_admin_ledger_summary").select("*").maybeSingle(),
      ]);

      const problems: string[] = [];
      if (usersRes.error) problems.push("users");
      else setTotalUsers(usersRes.count ?? 0);

      if (ticketsRes.error) problems.push("complaints");
      else {
        const rows = (ticketsRes.data as Complaint[]) || [];
        setComplaints(rows);

        const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
        if (ids.length > 0) {
          const { data: people } = await supabase.from("profiles").select("id, full_name, username").in("id", ids);
          const map: Record<string, Customer> = {};
          (people || []).forEach((p: any) => (map[p.id] = { full_name: p.full_name, username: p.username }));
          setCustomers(map);
        }
      }

      if (summaryRes.error) problems.push("financials");
      else if (summaryRes.data) {
        setFinancials({
          revenue: Number(summaryRes.data.total_accrued_revenue) || 0,
          collected: Number(summaryRes.data.total_collected) || 0,
          pending: Number(summaryRes.data.outstanding_balances) || 0,
        });
      }

      if (problems.length > 0)
        setLoadError(`Could not load: ${problems.join(", ")}. Check your admin permissions and try again.`);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  /* ---------- derived ---------- */
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { All: complaints.length, Open: 0, Investigating: 0, Resolved: 0 };
    complaints.forEach((t) => (c[statusOf(t)] += 1));
    return c;
  }, [complaints]);

  const visibleComplaints = useMemo(
    () => (filter === "All" ? complaints : complaints.filter((c) => statusOf(c) === filter)),
    [complaints, filter]
  );

  const collectionRate = financials.revenue > 0 ? Math.min(100, Math.round((financials.collected / financials.revenue) * 100)) : 0;

  const customerLabel = (c: Complaint) => {
    const p = c.user_id ? customers[c.user_id] : undefined;
    return displayName(p, "Unknown customer");
  };

  /* ---------- actions ---------- */
  const advanceTicket = async (c: Complaint) => {
    const current = statusOf(c);
    if (current === "Resolved" || advancingId) return;
    const next: Status = current === "Open" ? "Investigating" : "Resolved";

    setAdvancingId(c.id);
    try {
      const { data, error } = await supabase
        .from("customer_complaints")
        .update({ resolution_status: next })
        .eq("id", c.id)
        .select("id");
      if (error) throw error;
      // RLS can reject an update without raising an error; zero rows means it did not happen
      if (!data || data.length === 0) throw new Error("You do not have permission to update this complaint.");

      setComplaints((prev) => prev.map((t) => (t.id === c.id ? { ...t, resolution_status: next } : t)));
      showToast(`Complaint moved to ${next}.`, { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not update this complaint.", { type: "error" });
    } finally {
      setAdvancingId(null);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // The root layout guard sends the user to the login screen
    } catch (e: any) {
      showToast(e?.message || "Could not log out.", { type: "error" });
      setSigningOut(false);
    }
  };

  const printAnalyticsPdf = async () => {
    if (exporting) return;
    setExporting("pdf");
    try {
      const generated = formatDateTime(new Date().toISOString());
      const rows = complaints
        .slice(0, 50)
        .map(
          (c) => `<tr>
            <td>${escapeHtml(formatDateTime(c.created_at))}</td>
            <td>${escapeHtml(c.complaint_category)}</td>
            <td>${escapeHtml(statusOf(c))}</td>
            <td>${escapeHtml(customerLabel(c))}</td>
          </tr>`
        )
        .join("");

      const html = `<html><head><meta charset="utf-8" /><style>
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1F1612;padding:32px}
        h1{margin:0 0 4px;font-size:24px} .sub{color:#6B5F57;margin-bottom:24px;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px}
        th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #ECE6DD}
        th{background:#F5EEE2;font-weight:600} h2{font-size:16px;margin:24px 0 8px}
      </style></head><body>
        <h1>Vatican Cake Point audit</h1>
        <div class="sub">Generated ${escapeHtml(generated)}</div>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Registered users</td><td>${totalUsers}</td></tr>
          <tr><td>Accrued revenue</td><td>${escapeHtml(formatKes(financials.revenue))}</td></tr>
          <tr><td>Collected</td><td>${escapeHtml(formatKes(financials.collected))}</td></tr>
          <tr><td>Outstanding balances</td><td>${escapeHtml(formatKes(financials.pending))}</td></tr>
          <tr><td>Collection rate</td><td>${collectionRate}%</td></tr>
        </table>
        <h2>Complaints (${counts.Open} open, ${counts.Investigating} investigating, ${counts.Resolved} resolved)</h2>
        <table>
          <tr><th>Date</th><th>Category</th><th>Status</th><th>Customer</th></tr>
          ${rows || '<tr><td colspan="4">No complaints on record.</td></tr>'}
        </table>
      </body></html>`;

      const ok = await sharePdf(html, { filename: `Vatican-Cake-Point-Audit-${fileStamp()}`, dialogTitle: "Share audit report" });
      if (!ok) {
        showToast("Sharing is not available on this device.", { type: "error" });
        return;
      }
      showToast("PDF report ready.", { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not create the PDF report.", { type: "error" });
    } finally {
      setExporting(null);
    }
  };

  const exportAnalyticsCsv = async () => {
    if (exporting) return;
    setExporting("csv");
    try {
      const lines: string[] = [
        "Metric,Value",
        `${csvCell("Total users")},${csvCell(totalUsers)}`,
        `${csvCell("Accrued revenue (KES)")},${csvCell(financials.revenue)}`,
        `${csvCell("Collected (KES)")},${csvCell(financials.collected)}`,
        `${csvCell("Outstanding (KES)")},${csvCell(financials.pending)}`,
        "",
        "Date,Category,Status,Customer,Details",
        ...complaints.map((c) =>
          [
            csvCell(formatDateTime(c.created_at)),
            csvCell(c.complaint_category),
            csvCell(statusOf(c)),
            csvCell(customerLabel(c)),
            csvCell(c.complaint_body),
          ].join(",")
        ),
      ];
      // BOM so Excel opens the file as UTF-8
      const csv = `\uFEFF${lines.join("\n")}`;

      const csvFile = new File(Paths.cache, `Vatican_Master_Audit_${fileStamp()}.csv`);
      if (!csvFile.exists) csvFile.create();
      csvFile.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(csvFile.uri, { mimeType: "text/csv", dialogTitle: "Share audit spreadsheet" });
        showToast("Spreadsheet export ready.", { type: "success" });
      } else {
        showToast("Sharing is not available on this device.", { type: "error" });
      }
    } catch (e: any) {
      showToast(e?.message || "Could not export the spreadsheet.", { type: "error" });
    } finally {
      setExporting(null);
    }
  };

  /* ---------- render ---------- */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading operations data…</Text>
      </View>
    );
  }

  const listHeader = (
    <View>
      {!!loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <Pressable onPress={() => fetchMasterData(true)} hitSlop={8}>
            <Text style={styles.errorBannerAction}>Retry</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.metricGrid}>
        <Metric icon={<Users size={18} color={Colors.gold} strokeWidth={1.75} />} label="Registered users" value={String(totalUsers)} />
        <Metric icon={<Banknote size={18} color={Colors.gold} strokeWidth={1.75} />} label="Accrued revenue" value={formatKes(financials.revenue)} />
        <Metric icon={<Wallet size={18} color={Colors.gold} strokeWidth={1.75} />} label="Collected" value={formatKes(financials.collected)} />
        <Metric icon={<Hourglass size={18} color={Colors.gold} strokeWidth={1.75} />} label="Outstanding" value={formatKes(financials.pending)} />
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>Collection rate</Text>
          <Text style={styles.rateValue}>{collectionRate}%</Text>
        </View>
        <View style={styles.rateTrack}>
          <View style={[styles.rateFill, { width: `${collectionRate}%` }]} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Complaints</Text>
      <View style={styles.filterRow}>
        {(["All", ...STATUSES] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f} {counts[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderTicket = ({ item }: { item: Complaint }) => {
    const status = statusOf(item);
    const tone = STATUS_TONE[status];
    const advancing = advancingId === item.id;

    return (
      <View style={styles.ticketCard}>
        <View style={styles.ticketTop}>
          <Text style={styles.ticketCategory} numberOfLines={1}>
            {item.complaint_category}
          </Text>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{status}</Text>
          </View>
        </View>

        <Text style={styles.ticketMeta} numberOfLines={1}>
          {customerLabel(item)}
          {item.created_at ? `, ${formatDateTime(item.created_at)}` : ""}
        </Text>

        <Text style={styles.ticketBody}>{item.complaint_body}</Text>

        {status !== "Resolved" && (
          <Pressable
            onPress={() => advanceTicket(item)}
            disabled={!!advancingId}
            style={({ pressed }) => [
              styles.advanceBtn,
              pressed && { opacity: 0.9 },
              !!advancingId && !advancing && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
          >
            {advancing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.advanceText}>{status === "Open" ? "Start investigating" : "Mark as resolved"}</Text>
            )}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Operations</Text>
          <Text style={styles.headerSub}>Vatican Cake Point admin</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            icon={<FileText size={18} color={Colors.ink} strokeWidth={1.75} />}
            label="Export PDF report"
            onPress={printAnalyticsPdf}
            busy={exporting === "pdf"}
            disabled={!!exporting}
          />
          <IconButton
            icon={<Download size={18} color={Colors.ink} strokeWidth={1.75} />}
            label="Export spreadsheet"
            onPress={exportAnalyticsCsv}
            busy={exporting === "csv"}
            disabled={!!exporting}
          />
          <IconButton
            icon={<LogOut size={18} color={Colors.danger} strokeWidth={1.75} />}
            label="Log out"
            onPress={handleSignOut}
            busy={signingOut}
          />
        </View>
      </View>

      <FlatList
        data={visibleComplaints}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTicket}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMasterData(true)}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Inbox size={34} color={Colors.inkMuted} strokeWidth={1.5} />
            <Text style={styles.emptyText}>
              {filter === "All" ? "No complaints on record." : `No ${filter.toLowerCase()} complaints.`}
            </Text>
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: Colors.ink, letterSpacing: -0.4 },
  headerSub: { fontSize: 13, color: Colors.inkSoft, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },

  listContent: { padding: 16, paddingBottom: 48 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.dangerTint,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: Colors.danger, lineHeight: 19 },
  errorBannerAction: { fontSize: 14, fontWeight: "700", color: Colors.danger },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: {
    width: "47.8%",
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  metricIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  metricValue: { fontSize: 20, fontWeight: "800", color: Colors.ink, letterSpacing: -0.4 },
  metricLabel: { fontSize: 12.5, color: Colors.inkSoft, marginTop: 3 },

  rateCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  rateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  rateLabel: { fontSize: 14, color: Colors.inkSoft },
  rateValue: { fontSize: 14, fontWeight: "700", color: Colors.ink },
  rateTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.goldTint, overflow: "hidden" },
  rateFill: { height: 8, borderRadius: 4, backgroundColor: Colors.gold },

  sectionTitle: { fontSize: 17, fontWeight: "700", color: Colors.ink, marginTop: 26, marginBottom: 12, marginLeft: 2 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.hairline },
  filterChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  filterText: { fontSize: 13.5, fontWeight: "600", color: Colors.inkSoft },
  filterTextActive: { color: Colors.gold },

  ticketCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  ticketCategory: { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.ink },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "700" },
  ticketMeta: { fontSize: 12.5, color: Colors.inkMuted, marginTop: 4 },
  ticketBody: { fontSize: 14.5, lineHeight: 22, color: Colors.inkSoft, marginTop: 12 },
  advanceBtn: { height: 46, borderRadius: 14, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", marginTop: 14 },
  advanceText: { color: "#FFF", fontSize: 14.5, fontWeight: "700" },

  empty: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.inkSoft },
});