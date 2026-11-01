import { useFocusEffect } from "expo-router";
import { AlertCircle, CalendarClock, CircleCheckBig, Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { getCurrentUserRole, isAdminRole, normalizeRole } from "../../lib/adminAuth";
import { supabase } from "../../lib/supabase";

type ComplaintRow = {
  id: string;
  complaint_category?: string | null;
  complaint_body?: string | null;
  resolution_status?: "Open" | "Investigating" | "Resolved" | string;
  order_id?: string | null;
  created_at?: string | null;
};

const STATUSES = ["Open", "Investigating", "Resolved"] as const;

export default function AdminSupportDeskScreen() {
  const { showToast } = useAppToast();
  const [role, setRole] = useState<string>("Customer");
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoading(!isRefresh);

    try {
      const currentRole = await getCurrentUserRole();
      setRole(currentRole || "Customer");

      if (!isAdminRole(currentRole)) {
        showToast("You do not have access to support controls.", { type: "error" });
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from("customer_complaints")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);

      if (error) throw error;
      setRows((data as ComplaintRow[]) || []);
    } catch (e: any) {
      showToast(e?.message || "Could not load support desk.", { type: "error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [row.complaint_category, row.complaint_body, row.order_id, row.resolution_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const setStatus = async (row: ComplaintRow, status: (typeof STATUSES)[number]) => {
    if (busyId) return;
    if (!isAdminRole(role)) {
      showToast("Only admins can update complaints.", { type: "error" });
      return;
    }

    setBusyId(row.id);
    try {
      const { error } = await supabase
        .from("customer_complaints")
        .update({ resolution_status: status })
        .eq("id", row.id);

      if (error) throw error;

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, resolution_status: status } : item,
        ),
      );
      showToast(`Ticket moved to ${status}.`, { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not update complaint.", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const statusTone = (status?: string | null) => {
    const key = normalizeRole(status);
    if (key === "resolved") return styles.statusResolved;
    if (key === "investigating") return styles.statusInvestigating;
    return styles.statusOpen;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading support desk...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Resolution Desk</Text>
            <Text style={styles.subtitle}>Escalated customer care workflow controls</Text>

            <View style={styles.searchWrap}>
              <Search size={16} color={Colors.inkMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by category, status, body, order id"
                placeholderTextColor={Colors.inkMuted}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          const status = item.resolution_status || "Open";

          return (
            <View style={styles.card}>
              <View style={styles.topRow}>
                <View style={[styles.statusPill, statusTone(status)]}>
                  <Text style={styles.statusText}>{status}</Text>
                </View>
                <Text style={styles.orderRef}>Order: {item.order_id || "N/A"}</Text>
              </View>

              <Text style={styles.category}>{item.complaint_category || "General complaint"}</Text>
              <Text style={styles.bodyText}>{item.complaint_body || "No complaint body provided."}</Text>

              <View style={styles.metaRow}>
                <CalendarClock size={14} color={Colors.inkMuted} />
                <Text style={styles.metaText}>{item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown date"}</Text>
              </View>

              <View style={styles.actionRow}>
                {STATUSES.map((s) => {
                  const active = status === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => void setStatus(item, s)}
                      disabled={busy || active}
                      style={[
                        styles.actionBtn,
                        active && styles.actionBtnActive,
                        (busy || active) && styles.btnDisabled,
                      ]}
                    >
                      {busy && !active ? (
                        <ActivityIndicator size="small" color={Colors.ink} />
                      ) : active ? (
                        <View style={styles.actionActiveWrap}>
                          <CircleCheckBig size={12} color={Colors.ink} />
                          <Text style={styles.actionTextActive}>{s}</Text>
                        </View>
                      ) : (
                        <Text style={styles.actionText}>{s}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <AlertCircle size={22} color={Colors.inkMuted} />
            <Text style={styles.emptyText}>No complaints match your search.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  loadingText: { marginTop: 10, color: Colors.inkSoft, fontSize: 14 },

  headerWrap: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: Colors.ink },
  subtitle: { marginTop: 3, color: Colors.inkSoft, fontSize: 13 },
  searchWrap: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.ink, fontSize: 14 },

  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, height: 24, justifyContent: "center" },
  statusOpen: { backgroundColor: "#FFF4E0" },
  statusInvestigating: { backgroundColor: "#EAF4FF" },
  statusResolved: { backgroundColor: Colors.successTint },
  statusText: { color: Colors.ink, fontWeight: "700", fontSize: 11.5 },
  orderRef: { color: Colors.inkSoft, fontSize: 12 },

  category: { marginTop: 10, fontWeight: "700", color: Colors.ink, fontSize: 14.5 },
  bodyText: { marginTop: 5, color: Colors.inkSoft, lineHeight: 20, fontSize: 13.5 },

  metaRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: Colors.inkMuted, fontSize: 12.5 },

  actionRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.goldTint },
  actionText: { color: Colors.inkSoft, fontSize: 12.5, fontWeight: "600" },
  actionTextActive: { color: Colors.ink, fontSize: 12.5, fontWeight: "700" },
  actionActiveWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  btnDisabled: { opacity: 0.7 },

  emptyWrap: { marginTop: 28, alignItems: "center", gap: 8 },
  emptyText: { color: Colors.inkSoft, fontSize: 13 },
});
