import { ExternalLink } from "lucide-react-native";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { LEGAL_CONFIG, LegalSection } from "../constants/legal";

/** Renders a privacy policy / terms document. Used by the legal screens. */
export default function LegalDocument({
  title,
  sections,
  url,
}: {
  title: string;
  sections: LegalSection[];
  /** Optional hosted copy. When set, a "View online" button appears. */
  url?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.brand}>{LEGAL_CONFIG.businessName}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.updated}>Last updated: {LEGAL_CONFIG.lastUpdated}</Text>

      {sections.map((s, i) => (
        <View key={s.heading} style={styles.section}>
          <Text style={styles.heading}>
            {i + 1}. {s.heading}
          </Text>
          {s.paragraphs?.map((p) => (
            <Text key={p} style={styles.paragraph} selectable>
              {p}
            </Text>
          ))}
          {s.bullets?.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <View style={styles.dot} />
              <Text style={styles.bulletText} selectable>
                {b}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {!!url && (
        <Pressable
          onPress={() => Linking.openURL(url)}
          style={({ pressed }) => [styles.online, pressed && { backgroundColor: Colors.goldTint }]}
          accessibilityRole="link"
        >
          <ExternalLink size={16} color={Colors.ink} strokeWidth={1.75} />
          <Text style={styles.onlineText}>View online</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  brand: { fontSize: 12, fontWeight: "700", letterSpacing: 1.6, color: Colors.gold, textTransform: "uppercase" },
  title: { fontSize: 28, fontWeight: "800", color: Colors.ink, letterSpacing: -0.6, marginTop: 6 },
  updated: { fontSize: 13, color: Colors.inkSoft, marginTop: 6, marginBottom: 8 },
  section: { marginTop: 22 },
  heading: { fontSize: 16.5, fontWeight: "700", color: Colors.ink, marginBottom: 8 },
  paragraph: { fontSize: 15, lineHeight: 23, color: Colors.inkSoft, marginBottom: 8 },
  bulletRow: { flexDirection: "row", gap: 10, marginBottom: 8, paddingRight: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold, marginTop: 9 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 23, color: Colors.inkSoft },
  online: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.hairline, marginTop: 28, backgroundColor: Colors.surface,
  },
  onlineText: { fontSize: 15, fontWeight: "600", color: Colors.ink },
});