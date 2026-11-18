import { Stack } from "expo-router";

// Save as src/app/(auth)/_layout.tsx
// Without a layout file, Expo Router names the screen "(auth)/login" instead of "(auth)",
// so the root layout's <Stack.Screen name="(auth)" /> cannot find it and logs a warning.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}