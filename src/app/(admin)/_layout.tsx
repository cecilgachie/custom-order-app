import { Tabs } from "expo-router";
import {
    ClipboardList,
    LayoutDashboard,
    ShieldUser,
    Siren,
} from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";

// Staff area tabs. The root layout guard keeps staff inside this group.
export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
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
          tabBarLabel: "Overview",
          tabBarIcon: ({ color, size, focused }) => (
            <LayoutDashboard
              size={size}
              color={color}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ color, size, focused }) => (
            <ClipboardList
              size={size}
              color={color}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          tabBarLabel: "Users",
          tabBarIcon: ({ color, size, focused }) => (
            <ShieldUser
              size={size}
              color={color}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          tabBarLabel: "Support",
          tabBarIcon: ({ color, size, focused }) => (
            <Siren
              size={size}
              color={color}
              strokeWidth={focused ? 2.25 : 1.75}
            />
          ),
        }}
      />
    </Tabs>
  );
}
