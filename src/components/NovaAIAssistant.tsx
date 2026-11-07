import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { Colors } from "../constants/Colors";

/**
 * Floating "Ask Nova" button. Place it inside a screen's root View; it
 * floats bottom-right and opens the Nova chat page (src/app/nova.tsx).
 */
export default function NovaAIAssistant({ bottom = 20, right = 16 }: { bottom?: number; right?: number }) {
  const router = useRouter();

  // A soft ring that pulses a few times to draw the eye, then rests
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 1400, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== "web" }),
      ]),
      { iterations: 3 }
    );
    loop.start();
    return () => loop.stop();
  }, [ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom, right }]}>
      <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Pressable
        onPress={() => router.push("/nova")}
        style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityRole="button"
        accessibilityLabel="Ask Nova, the cake assistant"
        hitSlop={8}
      >
        <Sparkles size={24} color={Colors.gold} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const SIZE = 58;

const styles = StyleSheet.create({
  wrap: { position: "absolute", width: SIZE, height: SIZE, justifyContent: "center", alignItems: "center", zIndex: 20 },
  ring: { position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: Colors.gold },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.ink,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.gold,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});