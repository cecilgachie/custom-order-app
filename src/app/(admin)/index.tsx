import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import { useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  Download,
  HandCoins,
  Layers,
  Loader,
  Printer,
  Wallet,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

type LedgerSummary = {
  total_accrued_revenue: number;
  total_collected: number;
  outstanding_balances: number;
};

type QueueSummary = {
  pendingReview: number;
  baking: number;
  decorating: number;
};

const kes = (n: number) => `KES ${Math.round(n || 0).toLocaleString()}`;

export default function AdminOverviewScreen() {
  const { showToast } = useAppToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ledger, setLedger] = useState<LedgerSummary>({
    total_accrued_revenue: 0,
    total_collected: 0,
    outstanding_balances: 0,
  });
  const [queues, setQueues] = useState<QueueSummary>({
    pendingReview: 0,
    baking: 0,
    decorating: 0,
  });

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [ledgerRes, ordersRes] = await Promise.all([
        supabase
          .from("view_admin_ledger_summary")
          .select("total_accrued_revenue, total_collected, outstanding_balances")
          .single(),
        supabase
          .from("cake_orders")
          .select("order_status")
          .neq("payment_status", "Unpaid")
          .limit(500),
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (ordersRes.error) throw ordersRes.error;

      if (ledgerRes.data) {
        setLedger(ledgerRes.data);
      }

      const statusRows = ordersRes.data || [];
      const pendingReview = statusRows.filter(
        (row) => (row.order_status || "Pending Review") === "Pending Review",
      ).length;
      const baking = statusRows.filter((row) => row.order_status === "Baking").length;
      const decorating = statusRows.filter((row) => row.order_status === "Ready").length;

      setQueues({ pendingReview, baking, decorating });
    } catch (e: any) {
      const message = e?.message || "Could not load admin metrics.";
      setError(message);
      showToast(message, { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      void loadMetrics();
    }, [loadMetrics]),
  );

  const metrics = useMemo(
    () => [
      {
        label: "Total accrued revenue",
        value: kes(ledger.total_accrued_revenue),
        icon: Layers,
      },
      {
        label: "Total collected funds",
        value: kes(ledger.total_collected),
        icon: HandCoins,
      },
      {
        label: "Outstanding balances",
        value: kes(ledger.outstanding_balances),
        icon: Wallet,
      },
      {
        label: "Pending reviews",
        value: String(queues.pendingReview),
        icon: Loader,
      },
      {
        label: "Baking queue",
        value: String(queues.baking),
        icon: Loader,
      },
      {
        label: "Decorating workflow",
        value: String(queues.decorating),
        icon: Loader,
      },
    ],
    [ledger, queues],
  );

  const printMetrics = async () => {
    if (busy) return;
    setBusy("pdf");
    try {
      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>Vatican Cake Point - Admin Ledger</h1>
            <p>Total accrued revenue: ${kes(ledger.total_accrued_revenue)}</p>
            <p>Total collected funds: ${kes(ledger.total_collected)}</p>
            <p>Outstanding balances: ${kes(ledger.outstanding_balances)}</p>
            <p>Pending reviews: ${queues.pendingReview}</p>
            <p>Baking queue: ${queues.baking}</p>
            <p>Decorating workflow: ${queues.decorating}</p>
          </body>
        </html>
      `;
      await Print.printAsync({ html });
      showToast("Admin ledger sent to printer.", { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not print metrics.", { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    if (busy) return;
    setBusy("csv");
    try {
      const csv = [
        "Metric,Value",
        `Total Accrued Revenue,${ledger.total_accrued_revenue}`,
        `Total Collected Funds,${ledger.total_collected}`,
        `Outstanding Balances,${ledger.outstanding_balances}`,
        `Pending Reviews,${queues.pendingReview}`,
        `Baking Queue,${queues.baking}`,
        `Decorating Workflow,${queues.decorating}`,
      ].join("\n");

      const csvFile = new File(Paths.cache, "vatican-admin-ledger.csv");
      csvFile.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(csvFile.uri);
      }

      showToast("CSV exported successfully.", { type: "success" });
    } catch (e: any) {
      showToast(e?.message || "Could not export CSV.", { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading ledger matrix...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Admin Ledger Matrix</Text>
          <Text style={styles.subtitle}>Live bakery performance and queue health</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.iconBtn} onPress={printMetrics}>
            <Printer size={16} color="#FFF" />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: Colors.successGreen }]}
            onPress={exportCsv}
          >
            <Download size={16} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.card}>
            <metric.icon size={16} color={Colors.gold} />
            <Text style={styles.cardLabel}>{metric.label}</Text>
            <Text style={styles.cardValue}>{metric.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Operations Snapshot</Text>
        <Text style={styles.summaryText}>
          Pending review orders are awaiting final acceptance. Baking queue reflects in-kitchen
          workload. Decorating workflow reflects orders in "Ready" stage and should be prioritized
          for pickup coordination.
        </Text>
      </View>

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={Colors.gold} />
          <Text style={styles.busyText}>Generating export...</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  loadingText: { marginTop: 10, color: Colors.inkSoft, fontSize: 14 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "700", color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.inkSoft, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.lightBlue,
  },
  errorCard: {
    backgroundColor: Colors.dangerTint,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "48.5%",
    minHeight: 110,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    padding: 12,
    justifyContent: "space-between",
  },
  cardLabel: { fontSize: 12, color: Colors.inkSoft, marginTop: 8 },
  cardValue: { fontSize: 20, fontWeight: "700", color: Colors.ink, marginTop: 6 },
  summaryCard: {
    marginTop: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    padding: 14,
  },
  summaryTitle: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginBottom: 6 },
  summaryText: { fontSize: 13, color: Colors.inkSoft, lineHeight: 20 },
  busyRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  busyText: { color: Colors.inkSoft, fontSize: 13 },
});
