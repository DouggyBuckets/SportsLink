import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "@/components/theme";
import { Badge } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { gamesUntil, isNewPlayer, LATE_LEAVE_HOURS, MARK_CREDIT, missWeight, nextThreshold, reliabilityTier, reliabilityTone, weeklyChange, weeksLabel, weeksUntil } from "@/lib/reliability";
import { skillLabel } from "@/lib/sports";
import { AttendanceMark, Profile } from "@/lib/types";
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

export type RecentGame = { at: string; mark: AttendanceMark | null };

// One square per recent game, oldest to newest. Misses fade as they age,
// the way they count less toward the score.
function RecentGames({ history }: { history: RecentGame[] }) {
  const { colors } = useAppTheme();
  const anyMiss = history.some((g) => g.mark && g.mark !== "present");
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, color: colors.textTertiary }}>LAST {history.length} GAMES</Text>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {history.map((g, i) => {
          const tone = g.mark === null ? null : g.mark === "present" ? "success" : g.mark === "no_show" ? "danger" : "warning";
          const bg = tone ? colors[tone] : colors.fill;
          const icon = g.mark === null ? "ellipsis" : g.mark === "present" ? "checkmark" : g.mark === "no_show" ? "xmark" : "minus";
          const weight = g.mark && g.mark !== "present" ? Math.max(0.3, missWeight(g.at)) : 1;
          return (
            <View key={i} style={{ flex: 1, maxWidth: 30, aspectRatio: 1, borderRadius: 6, backgroundColor: bg, opacity: weight, alignItems: "center", justifyContent: "center" }}>
              <Icon name={icon} size={11} color={tone ? "#FFFFFF" : colors.textTertiary} />
            </View>
          );
        })}
      </View>
      {anyMiss ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>Faded = older miss, counting less each week</Text> : null}
    </View>
  );
}

const explain = () =>
  Alert.alert(
    "Reliability score",
    [
      "Everyone starts at 100%.",
      `After each game the host marks how each player did: present (full credit), late (${MARK_CREDIT.late * 100}%), left early (${MARK_CREDIT.left_early * 100}%) or no-show. If the host doesn't mark it within a day, the players vote.`,
      `Leaving less than ${LATE_LEAVE_HOURS} hours before kickoff counts as a miss.`,
      "Misses count less every week, so a low score recovers on its own, and faster when you play.",
      "Hosts can require a minimum score to join.",
    ].join("\n\n")
  );

// Where a below-par score is heading: the next minimum hosts set, how long
// until the player reaches it, and how many games would get them there now.
function Recovery({ user, color }: { user: Profile; color: string }) {
  const { colors } = useAppTheme();
  const events = user.scoreEvents ?? [];
  const target = nextThreshold(user.reliability);
  if (!target || events.length === 0) return null;
  const weeks = weeksUntil(events, target);
  const games = gamesUntil(events, target);
  const plan =
    weeks !== null && weeks > 0
      ? `Back to ${target}% in ${weeksLabel(weeks)}${games ? `, or sooner if you play ${games} more game${games === 1 ? "" : "s"}` : ""}.`
      : games
        ? `Play ${games} more game${games === 1 ? "" : "s"} to reach ${target}%.`
        : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.text }}>Next: {target}%+ games</Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.textSecondary, fontVariant: ["tabular-nums"] }}>
          {user.reliability} / {target}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(100, (user.reliability / target) * 100)}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
      </View>
      {plan ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, lineHeight: 18, color: colors.textSecondary }}>{plan}</Text> : null}
    </View>
  );
}

// `history` (own profile only): recent games, newest first. A null mark
// means attendance isn't settled yet.
export function ReliabilityCard({ user, history }: { user: Profile; history?: RecentGame[] }) {
  const { colors } = useAppTheme();
  const change = user.scoreEvents && !isNewPlayer(user) ? weeklyChange(user.scoreEvents) : 0;
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
          <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color }}>{reliabilityTier(user, change > 0)}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 20, color: colors.textSecondary }}>
              {user.ratedGames === 0 ? "No games counted yet" : `Showed up to ${user.attended} of ${user.ratedGames} games`}
            </Text>
            {change !== 0 ? <Badge label={`${change > 0 ? "▲ +" : "▼ "}${change}% this week`} tone={change > 0 ? "success" : "danger"} /> : null}
          </View>
        </View>

        {user.scoreEvents ? <Recovery user={user} color={color} /> : null}

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

// Own profile, once there's a miss to recover from.
export function RecoveryExplainer() {
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Icon name="clock" size={18} color={colors.tint} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.body, color: colors.text }}>How recovery works</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, lineHeight: 18, color: colors.textSecondary }}>
            Misses count less as they get older, and each game you show up to adds back more. One rough week won’t lock you out for the semester.
          </Text>
        </View>
      </View>
    </Card>
  );
}

export const soccerLevel = (p: Profile) => {
  const soccer = p.sports.find((s) => s.sport === "soccer");
  return soccer ? skillLabel(soccer.skill) : "Level not set";
};
