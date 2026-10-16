import { NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform } from "react-native";
import { useAppTheme } from "@/components/theme";
import { BLUE, MAIZE } from "@/constants/theme";

// Native tab bar: Games, My schedule, Profile. On iOS 26 the system draws it
// itself, so colors are dynamic rather than themed.
export default function TabsLayout() {
  const { colors } = useAppTheme();
  const tint = Platform.OS === "ios" ? DynamicColorIOS({ light: BLUE, dark: MAIZE }) : colors.tint;
  const label = Platform.OS === "ios" ? DynamicColorIOS({ light: "#3C4A5C", dark: "#E6ECF5" }) : colors.textSecondary;

  return (
    <NativeTabs tintColor={tint} labelStyle={{ color: label }} backgroundColor={colors.bg} blurEffect="systemChromeMaterial">
      <NativeTabs.Trigger name="(games)" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "soccerball", selected: "soccerball" }} />
        <NativeTabs.Trigger.Label>Games</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} />
        <NativeTabs.Trigger.Label>My schedule</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
