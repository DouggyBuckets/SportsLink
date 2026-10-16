import { createContext, use, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors } from "@/constants/theme";
import { useAppStore } from "@/lib/store";

type ThemeContextValue = {
  colors: ThemeColors;
  scheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const override = useAppStore((s) => s.themeOverride);

  const scheme = override === "system" ? (systemScheme === "dark" ? "dark" : "light") : override;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === "dark" ? darkColors : lightColors,
      scheme,
    }),
    [scheme]
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}
