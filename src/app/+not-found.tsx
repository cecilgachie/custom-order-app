import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";

// Save as src/app/+not-found.tsx (the "+" is part of the name).
// Shown for any address that does not exist, instead of a blank screen.
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: false }} />
      <View style={styles.container}>
        <Text style={styles.brand}>Vatican Cake Point</Text>
        <Text style={styles.title}>We could not find that page</Text>
        <Text style={styles.text}>The link may be old or mistyped.</Text>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.btnText}>Go to the home screen</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: Colors.background },
  brand: { fontSize: 13, fontWeight: "700", letterSpacing: 1.6, color: Colors.gold, textTransform: "uppercase" },
  title: { fontSize: 24, fontWeight: "800", color: Colors.ink, marginTop: 12, textAlign: "center", letterSpacing: -0.4 },
  text: { fontSize: 15, color: Colors.inkSoft, marginTop: 8 },
  btn: { marginTop: 24, height: 50, paddingHorizontal: 28, borderRadius: 16, backgroundColor: Colors.ink, justifyContent: "center" },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});