import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";

type HeaderProps = {
  title: string;
  subtitle?: string;
  // Rendered top-right, e.g. a Close button.
  right?: React.ReactNode;
  // Extra content inside the blue band, under the title (the free-time row).
  children?: React.ReactNode;
  // Tab roots sit under the status bar; modals already start below it.
  safeTop?: boolean;
};

// Michigan-blue band with a bold white title and softly rounded bottom
// corners - the header of every top-level screen and modal.
export function Header({ title, subtitle, right, children, safeTop = false }: HeaderProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.header,
        paddingTop: (safeTop ? insets.top : 0) + spacing.md,
        paddingBottom: spacing.lg,
        paddingHorizontal: spacing.lg,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
        borderCurve: "continuous",
        overflow: "hidden",
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: fonts.display, fontSize: typeScale.largeTitle, color: colors.onHeader, letterSpacing: -0.5 }}>
            {title}
          </Text>
          {subtitle ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, color: colors.onHeaderMuted }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

// Plain text button for the header corner ("Close", "Cancel").
export function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.onHeader }}>{label}</Text>
    </Pressable>
  );
}

// Maize pill for the header corner (quick actions).
export function HeaderPill({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: colors.maize, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.8 : 1 })}
    >
      <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.label, color: colors.onMaize }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Tappable row that sits inside the blue band: icon tile, small caps label,
// value, and an action word on the right ("Edit").
export function HeaderRow({ icon, label, value, action, onPress }: { icon: string; label: string; value: string; action: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${action}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: "rgba(255,255,255,0.09)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: 10,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, borderCurve: "continuous", backgroundColor: colors.maize, alignItems: "center", justifyContent: "center" }}>
        <Image source={`sf:${icon}`} style={{ width: 19, height: 19, tintColor: colors.onMaize }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, color: colors.onHeaderMuted }}>{label.toUpperCase()}</Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.onHeader }}>
          {value}
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.maize }}>{action}</Text>
    </Pressable>
  );
}
