import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { supabase } from "./supabase";

export const exportMonthlyLedgerToCsv = async (
  year: number,
  month: number,
): Promise<void> => {
  try {
    const { data: records, error } = await supabase
      .from("view_vatican_receipt_metadata")
      .select("*")
      .gte(
        "transaction_timestamp",
        `${year}-${String(month).padStart(2, "0")}-01`,
      )
      .lt(
        "transaction_timestamp",
        `${year}-${String(month + 1).padStart(2, "0")}-01`,
      );

    if (error || !records || records.length === 0) {
      Alert.alert(
        "Exporter",
        "No records found matching target parameters row timelines.",
      );
      return;
    }

    let csv =
      "Receipt Number,Cake Title,Flavor,Weight (KG),Gross Price (KES),Payment Type,Payment Status,M-Pesa Reference,Timestamp,Customer\n";
    records.forEach((row) => {
      csv += `"${row.receipt_number.substring(0, 8)}","${row.cake_title}","${row.flavor}",${row.total_weight_kg},${row.gross_price},"${row.payment_type}","${row.payment_status}","${row.mpesa_checkout_id}","${row.transaction_timestamp}","${row.customer_name || "Walk-In"}"\n`;
    });

    const fileUri = `${Paths.cache.uri}Vatican_Ledger_${year}_${month}.csv`;
    const csvFile = new File(
      Paths.cache,
      `Vatican_Ledger_${year}_${month}.csv`,
    );
    csvFile.write(csv);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(csvFile.uri, {
        mimeType: "text/csv",
        dialogTitle: "Accounting Export",
      });
    }
  } catch (err: any) {
    Alert.alert("Failure", err.message);
  }
};
