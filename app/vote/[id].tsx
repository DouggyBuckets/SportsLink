import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { Avatar, EmptyState } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Icon } from "@/components/ui/icon";
import { Divider } from "@/components/ui/list-section";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";
import { useNow } from "@/hooks/use-now";
import { Alert } from "@/lib/alert";
import { voteAttendance } from "@/lib/api";
import { formatWhen } from "@/lib/dates";
import { placeName } from "@/lib/locations";
import { canVote, hasVoted, HOST_MARK_HOURS, joinedPlayers } from "@/lib/selectors";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";

const closesIn = (closesAt: string, now: number) => {
  const hours = Math.max(1, Math.round((new Date(closesAt).getTime() - now) / 3_600_000));
  return hours < 24 ? `closes in ${hours} hour${hours === 1 ? "" : "s"}` : `closes in ${Math.round(hours / 24)} day${hours < 36 ? "" : "s"}`;
};

// The host didn't mark attendance in time, so the players settle it: each
// one votes on everyone else, anonymously, and the majority answer for each
// player counts toward their score when voting closes.
export default function Vote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const meId = useAppStore((s) => s.me?.id);
  const [votes, setVotes] = useState<Record<string, boolean>>(() => game?.attendanceVote?.mine ?? {});
  const [saving, setSaving] = useState(false);
  const close = <HeaderTextButton label="Close" onPress={() => router.back()} />;
  const vote = game?.attendanceVote;

  if (!game || !vote || !canVote(game, meId, new Date(now))) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Who showed up?" right={close} />
        <EmptyState icon="checklist" title="Voting has closed" body="Attendance for this game is settled." />
      </View>
    );
  }

  const others = joinedPlayers(game).filter((p) => p.user.id !== meId);
  const voted = hasVoted(game);

  const pick = (userId: string, showed: boolean) => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    setVotes((v) => {
      const next = { ...v };
      // Tapping the chosen answer again clears it.
      if (next[userId] === showed) delete next[userId];
      else next[userId] = showed;
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await voteAttendance(game.id, votes);
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save your votes", (e as Error).message);
      setSaving(false);
    }
  };

  const toggle = (userId: string, showed: boolean, name: string) => {
    const on = votes[userId] === showed;
    const tint = showed ? colors.success : colors.danger;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${name} ${showed ? "showed up" : "didn't show"}`}
        hitSlop={4}
        onPress={() => pick(userId, showed)}
        style={({ pressed }) => ({
          width: 34,
          height: 30,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: on ? tint : colors.fill,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name={showed ? "checkmark" : "xmark"} size={13} color={on ? "#FFFFFF" : colors.textTertiary} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Who showed up?" subtitle={`${gameTitle(game)} · ${placeName(game)} · ${formatWhen(game.startsAt)}`} right={close} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card tone="maize">
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text }}>Help settle attendance</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 20, color: colors.textSecondary }}>
              The host didn’t mark this game within {HOST_MARK_HOURS} hours, so players decide. The majority answer for each player counts toward their reliability score.
            </Text>
          </View>
        </Card>

        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, color: colors.textTertiary, marginBottom: -spacing.xs }}>TAP FOR EACH PLAYER · VOTES ARE ANONYMOUS</Text>
        <Card padding={0}>
          {others.map((p, i) => {
            const t = vote.tally[p.user.id];
            const total = t ? t.yes + t.no : 0;
            const summary = total === 0 ? "No votes yet" : `${t!.yes} of ${total} say showed up`;
            return (
              <View key={p.user.id}>
                {i > 0 ? <Divider inset={spacing.md} /> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md }}>
                  <Avatar user={p.user} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>
                      {p.user.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>
                      {game.host?.id === p.user.id ? "Host · " : ""}
                      {summary}
                    </Text>
                  </View>
                  {toggle(p.user.id, true, p.user.name)}
                  {toggle(p.user.id, false, p.user.name)}
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, color: colors.textSecondary, textAlign: "center" }}>
          {vote.voted} of {vote.voters} players have voted · {closesIn(vote.closesAt, now)}
        </Text>
        <Button label={voted ? "Update my votes" : "Submit my votes"} variant="maize" fullWidth disabled={Object.keys(votes).length === 0} loading={saving} onPress={submit} />
      </View>
    </View>
  );
}
