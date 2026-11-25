import { Tabs } from "expo-router";
import { BarChart3, Home, Package, Palette, ShoppingCart } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";

/**
 * Exactly these five screens get a tab, in this order. The names are the file
 * names in this folder: index.tsx, cart.tsx, orders.tsx, analytics.tsx, customize.tsx.
 * Any other file added here later stays reachable by link but never becomes a tab.
 */
const VISIBLE_TABS = ["index", "cart", "orders", "analytics", "customize"];

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false, // each screen draws its own header
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.1 },
        // No fixed height: the default adapts to the home indicator on iPhones
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.hairline,
        },
        ...(VISIBLE_TABS.includes(route.name) ? {} : { tabBarItemStyle: { display: "none" as const } }),
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size, focused }) => <Home size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          tabBarLabel: "Cart",
          tabBarIcon: ({ color, size, focused }) => <ShoppingCart size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color, size, focused }) => <Package size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarLabel: "Analytics",
          tabBarIcon: ({ color, size, focused }) => <BarChart3 size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="customize"
        options={{
          tabBarLabel: "Customize",
          tabBarIcon: ({ color, size, focused }) => <Palette size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
    </Tabs>
  );
}