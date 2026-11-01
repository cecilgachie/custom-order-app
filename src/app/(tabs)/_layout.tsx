import { Tabs } from "expo-router";
import { Home, ShoppingCart } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false, // each screen draws its own header
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
        // No fixed height: the default adapts to the home indicator on iPhones
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.hairline,
        },
      }}
    >
      {/* 1. Storefront feed */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Home size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />

      {/* 2. Cart */}
      <Tabs.Screen
        name="cart"
        options={{
          tabBarLabel: "Cart",
          tabBarIcon: ({ color, size, focused }) => (
            <ShoppingCart size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />

      {/* 3. Customizer: reachable by navigation only. Hidden from the tab bar
            (otherwise Expo Router adds it as a third tab) and the bar is
            removed on this screen so it doesn't sit under the Add to cart footer. */}
      <Tabs.Screen
        name="home/customize"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
    </Tabs>
  );
}