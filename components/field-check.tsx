import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { openReserveLink as open } from "@/components/field-booking";
import { useAppTheme } from "@/components/theme";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/list-section";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { FieldCheck } from "@/lib/fields";

// The post form's "is this field actually free?" panel: hours, daylight,
// Rec notices, clashes, and how to reserve it for real.
export function FieldCheckCard({ check }: { check: FieldCheck }) {
  const { colors } = useAppTheme();
  const tones = { success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.textTertiary };
  if (check.lines.length === 0 && !check.reserve) return null;

  return (
    <Card padding={0}>
      {check.lines.map((line, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={spacing.md} /> : null}
          <Pressable
            disabled={!line.url}
            onPress={() => line.url && open(line.url)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Image source={`sf:${line.icon}`} style={{ width: 17, height: 17, tintColor: tones[line.tone] }} />
            <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: typeScale.body, lineHeight: 20, color: line.tone === "danger" ? colors.danger : colors.text }}>{line.text}</Text>
            {line.url ? <Image source="sf:chevron.right" style={{ width: 8, height: 13, tintColor: colors.textTertiary }} /> : null}
          </Pressable>
        </View>
      ))}
      {check.reserve ? (
        <>
          {check.lines.length ? <Divider inset={spacing.md} /> : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => open(check.reserve!.url)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 })}
          >
            <Image source="sf:calendar.badge.plus" style={{ width: 17, height: 17, tintColor: colors.tint }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.tint }}>Reserve this field</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>{check.reserve.note}</Text>
            </View>
            <Image source="sf:arrow.up.right" style={{ width: 12, height: 12, tintColor: colors.textTertiary }} />
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}
