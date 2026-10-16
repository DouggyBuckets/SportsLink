import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" options={{ presentation: "card", animation: "slide_from_right" }} />
    </Stack>
  );
}
