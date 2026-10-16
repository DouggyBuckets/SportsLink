import { Stack } from "expo-router";
import { useAppTheme } from "@/components/theme";
import { stackScreenOptions, TabStack } from "@/components/navigation";

export default function Layout() {
  const { colors } = useAppTheme();
  return (
    <TabStack>
      <Stack screenOptions={stackScreenOptions(colors)}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
      </Stack>
    </TabStack>
  );
}
