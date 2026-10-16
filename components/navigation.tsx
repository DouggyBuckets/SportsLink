import type { ComponentProps, ReactNode } from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { fonts, ThemeColors } from "@/constants/theme";

type StackOptions = Extract<ComponentProps<typeof Stack>["screenOptions"], object>;

// Wraps a tab's native Stack so the canvas color shows during transitions.
export function TabStack({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

// Pushed screens (Friends, Settings) get a native header in the same solid
// Michigan blue as the in-content <Header />.
export function stackScreenOptions(colors: ThemeColors): StackOptions {
  return {
    headerShown: false,
    headerShadowVisible: false,
    headerLargeTitle: false,
    headerStyle: { backgroundColor: colors.header },
    headerTitleStyle: { color: colors.onHeader, fontFamily: fonts.heading },
    headerBackButtonDisplayMode: "minimal",
    headerTintColor: colors.onHeader,
    contentStyle: { backgroundColor: colors.bg },
  };
}
