import { Tabs } from "expo-router";
import { Home, Package, ShoppingCart } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";

/**
 * Only these screens get a tab in the bottom bar.
 * Expo Router makes a tab for EVERY file in this folder, with a plain default icon.
 * Anything else added here later stays reachable by link but never becomes a tab.
 */
const VISIBLE_TABS = ["index", "cart", "orders"];

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
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
        ...(VISIBLE_TABS.includes(route.name) ? {} : { tabBarItemStyle: { display: "none" as const } }),
      })}
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

      {/* 3. Orders: history, live progress, balance payments */}
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color, size, focused }) => (
            <Package size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
    </Tabs>
  );
}