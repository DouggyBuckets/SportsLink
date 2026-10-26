import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { fonts, radius, spacing } from "@/constants/theme";
import { useAppTheme } from "@/components/theme";
import { Icon } from "@/components/ui/icon";

// primary: blue with maize text (swaps in dark) - row actions like Join.
// maize: the single main action on a screen (Join this game, Post, Save).
// onMaize: fixed blue, for buttons sitting on a maize surface in either theme.
type ButtonVariant = "primary" | "maize" | "onMaize" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ label, onPress, variant = "primary", size = "lg", icon, disabled, loading, fullWidth }: ButtonProps) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    maize: { bg: colors.maize, fg: colors.onMaize },
    onMaize: { bg: colors.onMaize, fg: colors.maize },
    secondary: { bg: colors.tintSoft, fg: colors.tint },
    ghost: { bg: "transparent", fg: colors.tint },
    outline: { bg: "transparent", fg: colors.text, border: colors.divider },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const { bg, fg, border } = palette[variant];
  const paddingVertical = size === "lg" ? 15 : size === "md" ? 11 : 7;
  const fontSize = size === "lg" ? 17 : size === "md" ? 15 : 14;

  return (
    <AnimatedPressable
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => scale.set(withTiming(0.97, { duration: 90 }))}
      onPressOut={() => scale.set(withTiming(1, { duration: 140 }))}
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[
        animStyle,
        {
          backgroundColor: bg,
          paddingVertical,
          paddingHorizontal: size === "sm" ? 18 : spacing.lg,
          borderRadius: radius.pill,
          borderCurve: "continuous",
          borderWidth: border ? 1 : 0,
          borderColor: border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.xs,
          opacity: disabled ? 0.4 : 1,
          // sm buttons only ever sit inside rows, where they should centre on
          // the cross axis; larger ones lead a column from its left edge.
          alignSelf: fullWidth ? "stretch" : size === "sm" ? "center" : "flex-start",
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={fontSize} color={fg} /> : null}
          <Text style={{ color: fg, fontFamily: fonts.display, fontSize }}>{label}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}
