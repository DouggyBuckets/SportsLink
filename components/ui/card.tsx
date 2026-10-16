import { StyleProp, View, ViewStyle } from "react-native";
import { useAppTheme } from "@/components/theme";
import { radius, spacing } from "@/constants/theme";

type CardProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  // "maize" is the highlighted callout (invites, "still in?", attendance due).
  tone?: "default" | "maize";
};

// The one card surface: white, hairline border, small radius. Flat on
// purpose - it should read like a U-M app, not a glassy consumer app.
export function Card({ children, style, padding = spacing.md, tone = "default" }: CardProps) {
  const { colors } = useAppTheme();
  const maize = tone === "maize";
  return (
    <View
      style={[
        {
          backgroundColor: maize ? colors.maizeSoft : colors.cardSolid,
          borderWidth: 1,
          borderColor: maize ? colors.maize : colors.cardBorder,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          overflow: "hidden",
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
