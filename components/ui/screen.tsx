import { ScrollView, ScrollViewProps, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { spacing } from "@/constants/theme";

type ScreenProps = ScrollViewProps & {
  children: React.ReactNode;
  // A <Header /> pinned above the scrolling content.
  header?: React.ReactNode;
  // A native navigation header sits above (pushed screens like Settings).
  nativeHeader?: boolean;
  // Extra bottom padding so content clears the tab bar / a pinned button.
  bottomInset?: number;
};

// Standard screen shell: optional fixed header, then a padded scroll view on
// the flat grey canvas.
export function Screen({ children, header, nativeHeader = false, bottomInset = 120, contentContainerStyle, ...rest }: ScreenProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const paddingTop = header || nativeHeader ? spacing.lg : insets.top + spacing.sm;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior={nativeHeader ? "automatic" : "never"}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: spacing.lg, paddingTop, paddingBottom: bottomInset, gap: spacing.md }, contentContainerStyle]}
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}
