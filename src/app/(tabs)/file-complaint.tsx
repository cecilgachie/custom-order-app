import { useRouter } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { useAppToast } from "../../context/ToastContext";
import { supabase } from "../../lib/supabase";

const CATEGORIES = [
  "Cake Quality Issue",
  "Late Delivery",
  "Wrong Order Received",
  "Payment Problem",
  "Customer Service",
  "Other",
];
const MIN_LENGTH = 15;
const MAX_LENGTH = 1000;

export default function CustomerComplaintForm() {
  const { showToast } = useAppToast();
  const router = useRouter();

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitTicket = async () => {
    if (submitting) return;

    const body = description.trim();
    if (body.length < MIN_LENGTH) {
      const message = `Please give us a little more detail (at least ${MIN_LENGTH} characters).`;
      setError(message);
      return showToast(message);
    }
    setError(null);

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast("Your session expired. Please sign in again.");
        router.replace("/(auth)/login");
        return;
      }

      const { error: insertError } = await supabase.from("customer_complaints").insert({
        user_id: user.id,
        complaint_category: category,
        complaint_body: body,
      });
      if (insertError) throw insertError;

      showToast("📢 Complaint received. Our team will review it and follow up with you.");
      if (router.canGoBack()) router.back();
      else router.replace("/profile");
    } catch (e: any) {
      showToast(e?.message || "Could not send your complaint. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <ShieldAlert size={22} color={Colors.gold} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>We want to make it right</Text>
            <Text style={styles.introText}>
              Tell us what went wrong and our team will look into it personally.
            </Text>
          </View>
        </View>

        {/* Category */}
        <Text style={styles.sectionLabel}>What is this about?</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((item) => {
            const active = category === item;
            return (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Description */}
        <Text style={styles.sectionLabel}>Tell us what happened</Text>
        <View style={[styles.areaWrap, !!error && styles.areaWrapError]}>
          <TextInput
            style={styles.area}
            multiline
            placeholder="Include what you ordered, when, and what went wrong..."
            placeholderTextColor={Colors.inkMuted}
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              if (error) setError(null);
            }}
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {description.length}/{MAX_LENGTH}
          </Text>
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
            submitting && { opacity: 0.75 },
          ]}
          onPress={submitTicket}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit complaint"
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Submit complaint</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingBottom: 40 },

  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  introIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.goldTint, justifyContent: "center", alignItems: "center" },
  introTitle: { fontSize: 16, fontWeight: "700", color: Colors.ink },
  introText: { fontSize: 13.5, color: Colors.inkSoft, marginTop: 3, lineHeight: 20 },

  sectionLabel: { fontSize: 15, fontWeight: "700", color: Colors.ink, marginTop: 24, marginBottom: 10, marginLeft: 2 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    height: 38,
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 14, fontWeight: "500", color: Colors.inkSoft },
  chipTextActive: { color: Colors.gold, fontWeight: "600" },

  areaWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    padding: 14,
  },
  areaWrapError: { borderColor: Colors.danger, borderWidth: 1 },
  area: { minHeight: 140, fontSize: 15, color: Colors.ink, lineHeight: 22 },
  counter: { alignSelf: "flex-end", fontSize: 12, color: Colors.inkMuted, marginTop: 6 },
  errorText: { fontSize: 12.5, color: Colors.danger, marginTop: 8, marginLeft: 4 },

  btn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.ink,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 26,
  },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});