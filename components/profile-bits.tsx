import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "@/components/theme";
import { Card } from "@/components/ui/card";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { isNewPlayer, reliabilityTone } from "@/lib/reliability";
import { skillLabel } from "@/lib/sports";
import { Profile } from "@/lib/types";

// Shared by the viewer's own Profile tab and the sheet for other players.

const RING = 100;
const STROKE = 9;

// Circular progress ring with the score in the middle.
function ReliabilityRing({ value, color }: { value: number; color: string }) {
  const { colors } = useAppTheme();
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
      <Svg width={RING} height={RING} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.fill} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </Svg>
      <Text style={{ fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, color: colors.text, fontVariant: ["tabular-nums"] }}>
        {value}
        <Text style={{ fontSize: 14 }}>%</Text>
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

export function ReliabilityCard({ user }: { user: Profile }) {
  const { colors } = useAppTheme();
  const tone = reliabilityTone(user);
  const color = tone === "neutral" ? colors.success : colors[tone];
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <ReliabilityRing value={user.reliability} color={color} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.text }}>
            Reliability score{isNewPlayer(user) ? <Text style={{ color: colors.textSecondary }}> · New</Text> : null}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Stat value={`${user.attended}/${user.ratedGames}`} label="Showed up" />
            <Stat value={String(user.gamesHosted)} label="Hosted" />
          </View>
        </View>
      </View>
    </Card>
  );
}

export const soccerLevel = (p: Profile) => {
  const soccer = p.sports.find((s) => s.sport === "soccer");
  return soccer ? skillLabel(soccer.skill) : "Level not set";
};
