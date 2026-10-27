import { Tabs } from "expo-router";
import { ColorValue } from "react-native";
import { useAppTheme } from "@/components/theme";
import { Icon } from "@/components/ui/icon";

// Web version of the tab bar. On web, NativeTabs floats over the top of the
// page and covers each screen's header, so browsers get a standard bottom
// tab bar instead. Same three tabs as _layout.tsx.
const tabIcon = (name: string) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} size={size} color={color} />;
  };

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.cardSolid, borderTopColor: colors.divider },
      }}
    >
      <Tabs.Screen name="(games)" options={{ title: "Games", tabBarIcon: tabIcon("soccerball") }} />
      <Tabs.Screen name="schedule" options={{ title: "My schedule", tabBarIcon: tabIcon("calendar") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon("person.crop.circle") }} />
    </Tabs>
  );
}
