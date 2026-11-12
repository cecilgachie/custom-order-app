import { Tabs } from "expo-router";
import { Home, Package, ShoppingCart } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.hairline,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Home size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          tabBarLabel: "Cart",
          tabBarIcon: ({ color, size, focused }) => (
            <ShoppingCart size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color, size, focused }) => (
            <Package size={size} color={color} strokeWidth={focused ? 2.25 : 1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="home/customize"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
    </Tabs>
  );
}