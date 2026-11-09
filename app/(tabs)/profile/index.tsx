import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text, View } from "react-native";
import { GameCard } from "@/components/game-card";
import { MarkBadge } from "@/components/attendance-bits";
import { RecoveryExplainer, ReliabilityCard, soccerLevel } from "@/components/profile-bits";
import { useAppTheme } from "@/components/theme";
import { Avatar, Badge, EmptyState, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { Screen } from "@/components/ui/screen";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { formatWhen } from "@/lib/dates";
import { placeName } from "@/lib/locations";
import { attendancePhase, canVote, hasVoted, myPast, myUpcoming, needsAttendance } from "@/lib/selectors";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { Game } from "@/lib/types";

export default function ProfileTab() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const games = useAppStore((s) => s.games);
  if (!me) return null;

  const upcoming = myUpcoming(games, me.id);
  const past = myPast(games, me.id);

  return (
    <Screen header={<Header safeTop title="Profile" right={<HeaderTextButton label="Settings" onPress={() => router.push("/profile/settings")} />} />}>
      <StatusBar style="light" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Avatar user={me} size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: typeScale.title, color: colors.text }}>{me.name}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>
              {me.classYear ?? "Student"} · {me.uniqname}@umich.edu
            </Text>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.text }}>Soccer · {soccerLevel(me)}</Text>
          </View>
        </View>
        {me.bio ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 21, color: colors.text, marginTop: spacing.sm }}>{me.bio}</Text> : null}
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Edit profile" variant="secondary" size="sm" onPress={() => router.push("/profile-edit")} />
        </View>
      </Card>

      <ReliabilityCard
        user={me}
        history={past.flatMap((g) => {
          // Only games that count; ones still waiting on the host or a vote don't.
          const mark = g.participants.find((p) => p.user.id === me.id)?.mark;
          return mark ? [{ at: g.startsAt, mark }] : [];
        })}
      />
      {me.ratedGames > me.attended || me.reliability < 100 ? <RecoveryExplainer /> : null}

      <View style={{ marginTop: spacing.sm }}>
        <SectionTitle title="Upcoming" />
      </View>
      {upcoming.length > 0 ? (
        upcoming.map((g) => <GameCard key={g.id} game={g} />)
      ) : (
        <Card padding={0}>
          <EmptyState icon="soccerball" title="No games yet" action={<Button label="Find a game" size="md" onPress={() => router.navigate("/")} />} />
        </Card>
      )}

      <View style={{ marginTop: spacing.sm }}>
        <SectionTitle title="Past games" />
      </View>
      {past.length > 0 ? (
        <Card padding={0}>
          {past.map((g, i) => {
            const action = pastAction(g, me.id);
            return (
              <View key={g.id}>
                {i > 0 ? <Divider inset={spacing.md} /> : null}
                <Pressable
                  onPress={() => router.push({ pathname: action.route, params: { id: g.id } })}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: pressed ? colors.fill : "transparent" })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.body, color: colors.text }}>{gameTitle(g)}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>
                      {formatWhen(g.startsAt)} · {placeName(g)}
                    </Text>
                  </View>
                  {action.badge}
                </Pressable>
              </View>
            );
          })}
        </Card>
      ) : (
        <Card padding={0}>
          <EmptyState icon="clock.arrow.circlepath" title="No games played yet" />
        </Card>
      )}
    </Screen>
  );
}

// What a past game row says about attendance, and where tapping it goes.
function pastAction(g: Game, meId: string): { badge: React.ReactNode; route: "/game/[id]" | "/attendance/[id]" | "/vote/[id]" } {
  if (needsAttendance(g, meId)) return { badge: <Badge label="Mark attendance" tone="maize" />, route: "/attendance/[id]" };
  if (canVote(g, meId)) return hasVoted(g) ? { badge: <Badge label="Voted" tone="info" icon="checkmark" />, route: "/vote/[id]" } : { badge: <Badge label="Vote on attendance" tone="maize" />, route: "/vote/[id]" };
  const mark = g.participants.find((p) => p.user.id === meId)?.mark;
  if (mark) return { badge: <MarkBadge mark={mark} />, route: "/game/[id]" };
  const phase = attendancePhase(g);
  const label = phase === "host" ? "Waiting on host" : phase === "vote" ? "Players voting" : "Not counted";
  return { badge: <Badge label={label} />, route: "/game/[id]" };
}
