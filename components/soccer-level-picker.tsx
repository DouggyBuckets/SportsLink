import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Fragment } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/list-section";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { SKILLS, SOCCER } from "@/lib/sports";
import { SkillLevel, SportId } from "@/lib/types";

export type SportPick = { sport: SportId; skill: SkillLevel };

const LEVELS = SKILLS.filter((s) => s.value !== "any");

// MVP1 is soccer only, so "what do you play?" is just "how well?". Stored in
// the profile's sports list so more sports can come back without a schema change.
export function SoccerLevelPicker({ value, onChange }: { value: SportPick[]; onChange: (v: SportPick[]) => void }) {
  const { colors } = useAppTheme();
  const current = value.find((v) => v.sport === SOCCER)?.skill;
  return (
    <Card padding={0}>
      {LEVELS.map((l, i) => {
        const on = current === l.value;
        return (
          <Fragment key={l.value}>
            {i > 0 ? <Divider inset={spacing.md} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
                onChange([{ sport: SOCCER, skill: l.value }]);
              }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: pressed ? colors.fill : "transparent" })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.subtitle, color: colors.text }}>{l.label}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>{l.blurb}</Text>
              </View>
              <Image source={`sf:${on ? "checkmark.circle.fill" : "circle"}`} style={{ width: 24, height: 24, tintColor: on ? colors.tint : colors.textTertiary }} />
            </Pressable>
          </Fragment>
        );
      })}
    </Card>
  );
}
