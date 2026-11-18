import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Icon } from "@/components/ui/icon";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { CHECK_IN_CLOSES_MIN, CHECK_IN_OPENS_MIN } from "@/lib/checkin";
import { FREE_GAMES, LATE_LEAVE_HOURS, MARK_CREDIT, MIN_RELIABILITY_OPTIONS } from "@/lib/reliability";
import { HOST_MARK_HOURS, VOTE_CLOSE_HOURS } from "@/lib/selectors";

const minutes = (m: number) => (m === 60 ? "an hour" : `${m} minutes`);

// The one place that explains the whole reliability score. Linked from the
// score on profiles and from games a player can't join.
export default function ReliabilityGuide() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const body = (text: string) => <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 21, color: colors.textSecondary }}>{text}</Text>;

  const section = (icon: string, title: string, children: React.ReactNode) => (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name={icon} size={18} color={colors.tint} />
          <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text }}>{title}</Text>
        </View>
        {children}
      </View>
    </Card>
  );

  const credit = (label: string, value: number) => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, color: colors.text }}>{label}</Text>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, fontVariant: ["tabular-nums"], color: value === 1 ? colors.success : value === 0 ? colors.danger : colors.warning }}>
        {value * 100}%
      </Text>
    </View>
  );

  const step = (n: number, title: string, text: string) => (
    <View key={n} style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.tint }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.text }}>{title}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, lineHeight: 19, color: colors.textSecondary }}>{text}</Text>
      </View>
    </View>
  );

  const minimums = MIN_RELIABILITY_OPTIONS.filter((m) => m > 0).map((m) => `${m}%`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="How reliability works" right={<HeaderTextButton label="Close" onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        {section("person.fill.checkmark", "What it is", body("Your reliability score shows how often you show up to the games you join. Everyone starts at 100%, so new players can join anything."))}

        {section(
          "checklist",
          "How it’s calculated",
          <>
            {body("Each game you join earns credit for how you did:")}
            <View>
              {credit("Showed up", MARK_CREDIT.present)}
              {credit("Late", MARK_CREDIT.late)}
              {credit("Left early", MARK_CREDIT.left_early)}
              {credit("No-show", MARK_CREDIT.no_show)}
            </View>
            {body(`Your score is your average credit. Everyone also gets ${FREE_GAMES} free games at full credit, so one early miss doesn’t sink you. Leaving a game less than ${LATE_LEAVE_HOURS} hours before kickoff counts as a no-show.`)}
          </>
        )}

        {section(
          "location.fill",
          "How attendance is recorded",
          <View style={{ gap: spacing.sm }}>
            {step(1, "Check in at the field", `Open the game when you get there, from ${minutes(CHECK_IN_OPENS_MIN)} before kickoff to ${minutes(CHECK_IN_CLOSES_MIN)} after. A check-in counts as showing up, and nothing below can change it.`)}
            {step(2, "The host marks the rest", `Within ${HOST_MARK_HOURS} hours of the game ending, the host marks everyone who didn’t check in.`)}
            {step(3, "Or the players vote", `If the host doesn’t, the players vote anonymously for the next ${(VOTE_CLOSE_HOURS - HOST_MARK_HOURS) / 24} days, and the majority answer counts. If nobody votes, the game doesn’t count.`)}
          </View>
        )}

        {section("chart.line.uptrend.xyaxis", "Getting your score back up", body("Your score recovers over time, even if you don’t play. Showing up to games brings it back faster. Your profile shows when you’ll be back to the next level."))}

        {section("person.badge.plus", "Minimum reliability", body(`Hosts can require a minimum score to join, like ${minimums.join(", ")}. If you’re below it, the host can still invite you, and an invite lets you join.`))}
      </ScrollView>
    </View>
  );
}
