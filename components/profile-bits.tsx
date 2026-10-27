import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "@/components/theme";
import { Card } from "@/components/ui/card";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { LATE_LEAVE_HOURS, reliabilityTier, reliabilityTone } from "@/lib/reliability";
import { skillLabel } from "@/lib/sports";
import { Profile } from "@/lib/types";
import { Icon } from "@/components/ui/icon";

// Shared by the viewer's own Profile tab and the sheet for other players.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 124;
const STROKE = 12;
const R = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Circular progress ring that fills up to the score when it appears.
function ReliabilityRing({ value, color }: { value: number; color: string }) {
  const { colors } = useAppTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(value / 100, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, value]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - progress.value) }));

  return (
    <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
      <Svg width={RING} height={RING} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.fill} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle cx={RING / 2} cy={RING / 2} r={R} stroke={color} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} animatedProps={animatedProps} />
      </Svg>
      <Text style={{ fontFamily: fonts.display, fontSize: 34, letterSpacing: -1, color: colors.text, fontVariant: ["tabular-nums"] }}>
        {value}
        <Text style={{ fontSize: 18 }}>%</Text>
      </Text>
    </View>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 1 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: color ?? colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

// One dot per recent game, oldest to newest.
function RecentGames({ history }: { history: (boolean | null)[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, color: colors.textTertiary }}>LAST {history.length} GAMES</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {history.map((attended, i) => {
          const bg = attended === null ? colors.fill : attended ? colors.successSoft : colors.dangerSoft;
          const fg = attended === null ? colors.textTertiary : attended ? colors.success : colors.danger;
          const icon = attended === null ? "ellipsis" : attended ? "checkmark" : "xmark";
          return (
            <View key={i} style={{ flex: 1, maxWidth: 30, aspectRatio: 1, borderRadius: radius.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
              <Icon name={icon} size={11} color={fg} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const explain = () =>
  Alert.alert(
    "Reliability score",
    [
      "Everyone starts at 100%.",
      "After each game the host marks who showed up.",
      `No-shows, and leaving less than ${LATE_LEAVE_HOURS} hours before kickoff, count as misses.`,
      "Hosts can require a minimum score to join.",
    ].join("\n\n")
  );

// `history` (own profile only): attendance for recent games, newest first.
// null = the host hasn't marked it yet.
export function ReliabilityCard({ user, history }: { user: Profile; history?: (boolean | null)[] }) {
  const { colors } = useAppTheme();
  const tone = reliabilityTone(user);
  const color = tone === "neutral" ? colors.success : colors[tone];
  const missed = user.ratedGames - user.attended;
  const recent = history?.slice(0, 10).reverse() ?? [];

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text }}>Reliability score</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="How the reliability score works" hitSlop={10} onPress={explain} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Icon name="info.circle" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <ReliabilityRing value={user.reliability} color={color} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color }}>{reliabilityTier(user)}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 20, color: colors.textSecondary }}>
              {user.ratedGames === 0 ? "No games counted yet" : `Showed up to ${user.attended} of ${user.ratedGames} games`}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: recent.length ? 1 : 0, borderColor: colors.divider }}>
          <Stat value={user.attended} label="Showed up" color={colors.success} />
          <Stat value={missed} label="Missed" color={missed > 0 ? colors.danger : undefined} />
          <Stat value={user.gamesHosted} label="Hosted" />
        </View>

        {recent.length ? <RecentGames history={recent} /> : null}
      </View>
    </Card>
  );
}

export const soccerLevel = (p: Profile) => {
  const soccer = p.sports.find((s) => s.sport === "soccer");
  return soccer ? skillLabel(soccer.skill) : "Level not set";
};
