import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useAppTheme } from "@/components/theme";
import { fonts, radius } from "@/constants/theme";

type SegmentedTabsProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
};

// iOS segmented control: a system-fill track with a sliding elevated thumb.
export function SegmentedTabs<T extends string>({ value, onChange, options }: SegmentedTabsProps<T>) {
  const { colors, scheme } = useAppTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width > 0 ? (width - 6) / options.length : 0;
  const x = useSharedValue(index * segment);

  useEffect(() => {
    x.set(withTiming(index * segment, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [index, segment, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: colors.fill,
        borderRadius: radius.pill,
        borderCurve: "continuous",
        padding: 3,
      }}
    >
      {segment > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 3,
              left: 3,
              width: segment,
              height: "100%",
              borderRadius: radius.pill,
              borderCurve: "continuous",
              backgroundColor: scheme === "dark" ? "rgba(70,92,120,0.9)" : "#FFFFFF",
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            },
            thumbStyle,
          ]}
        />
      )}
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
              onChange(opt.value);
            }}
            style={{ flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontFamily: active ? fonts.bodySemiBold : fonts.bodyMedium,
                fontSize: 13,
                color: active ? colors.text : colors.textSecondary,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
