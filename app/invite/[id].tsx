import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { Avatar, EmptyState, Field, ReliabilityBadge } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { invitePlayer, searchPeople, uninvitePlayer } from "@/lib/api";
import { formatWhen } from "@/lib/dates";
import { mini } from "@/lib/mock";
import { meetsMinimum } from "@/lib/reliability";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { MiniProfile } from "@/lib/types";

// Host-only. Invited players see the game up top in their feed and can join
// it even if they're below its minimum reliability.
export default function Invite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MiniProfile[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const close = <HeaderTextButton label="Done" onPress={() => router.back()} />;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchPeople(query)
        .then((people) => live && setResults(people.map(mini)))
        .catch(() => live && setResults([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Invite players" right={close} />
        <EmptyState icon="questionmark.circle" title="This game is gone" body="It may have been cancelled." />
      </View>
    );
  }

  const invited = game.invited ?? [];
  const inGame = new Set(game.participants.map((p) => p.user.id));

  const toggle = async (user: MiniProfile, isInvited: boolean) => {
    setBusyId(user.id);
    try {
      await (isInvited ? uninvitePlayer(game.id, user.id) : invitePlayer(game.id, user));
      if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    } catch (e) {
      Alert.alert("Couldn't update the invite", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const row = (user: MiniProfile, i: number) => {
    const isInvited = invited.some((u) => u.id === user.id);
    const joined = inGame.has(user.id);
    const below = !meetsMinimum(user, game.minReliability);
    return (
      <View key={user.id}>
        {i > 0 ? <Divider inset={spacing.md} /> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md }}>
          <Avatar user={user} size={34} />
          <View style={{ flex: 1, gap: 3, alignItems: "flex-start" }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>
              {user.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ReliabilityBadge user={user} />
              {below && !joined ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>below {game.minReliability}%</Text> : null}
            </View>
          </View>
          {joined ? (
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.textTertiary }}>In the game</Text>
          ) : (
            <Button label={isInvited ? "Invited" : "Invite"} icon={isInvited ? "checkmark" : undefined} size="sm" variant={isInvited ? "secondary" : "primary"} loading={busyId === user.id} onPress={() => toggle(user, isInvited)} />
          )}
        </View>
      </View>
    );
  };

  const searched = query.trim().length >= 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Invite players" subtitle={`${gameTitle(game)} · ${formatWhen(game.startsAt)}`} right={close} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {game.minReliability ? (
          <Card tone="maize">
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 20, color: colors.text }}>
              This game needs {game.minReliability}%+ reliability. Anyone you invite can join even if they’re below it, like a friend who missed a few games.
            </Text>
          </Card>
        ) : null}

        <Field value={query} onChangeText={setQuery} placeholder="Search by name or uniqname" autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />

        {searched ? (
          <Card padding={0}>{results.length ? results.map(row) : <EmptyState icon="magnifyingglass" title="No one found" body="Try a first name or a uniqname." />}</Card>
        ) : null}

        {invited.length ? (
          <>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, color: colors.textTertiary, marginBottom: -spacing.xs }}>INVITED · {invited.length}</Text>
            <Card padding={0}>{invited.map(row)}</Card>
          </>
        ) : !searched ? (
          <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary, textAlign: "center" }}>Search for players to invite to your game.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
