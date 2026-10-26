import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { useNow } from "@/hooks/use-now";
import { Avatar, Badge, EmptyState, ReliabilityBadge } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { cancelGame, confirmSpot, joinGame, leaveGame } from "@/lib/api";
import { formatDuration, formatTime, formatWhen, gameEnd } from "@/lib/dates";
import { mapsUrl, placeName } from "@/lib/locations";
import { isLateLeave, LATE_LEAVE_HOURS, meetsMinimum, minReliabilityLabel } from "@/lib/reliability";
import { fillState, hasEnded, hasStarted, isHost, joinedPlayers, myStatus, needsAttendance } from "@/lib/selectors";
import { gameTitle, skillLabel } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { Game, Participant } from "@/lib/types";
import { Icon } from "@/components/ui/icon";

const CONFIRM_WINDOW_MS = 24 * 60 * 60_000;

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const close = <HeaderTextButton label="Close" onPress={() => router.back()} />;

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Game not found" right={close} />
        <EmptyState icon="questionmark.circle" title="This game is gone" body="It may have been cancelled or removed by the host." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={gameTitle(game)} subtitle={`${placeName(game)} · ${formatWhen(game.startsAt)}`} right={close} />
      <Details game={game} bottomInset={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

function Details({ game, bottomInset }: { game: Game; bottomInset: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const meId = me?.id;
  const [busy, setBusy] = useState(false);

  const players = joinedPlayers(game);
  const fill = fillState(game);
  const status = myStatus(game, meId);
  const host = isHost(game, meId);
  const mine = game.participants.find((p) => p.user.id === meId);
  const now = useNow();
  const started = hasStarted(game, new Date(now));
  const open = game.status === "open" && !started;
  const msToStart = new Date(game.startsAt).getTime() - now;
  const canConfirm = open && status === "joined" && !mine?.confirmed && msToStart < CONFIRM_WINDOW_MS;
  const marking = needsAttendance(game, meId, new Date(now));
  const allowed = !me || meetsMinimum(me, game.minReliability);
  const spotsLeft = game.capacity - players.length;
  const late = isLateLeave(game, now);
  const leaveBy = new Date(new Date(game.startsAt).getTime() - LATE_LEAVE_HOURS * 3_600_000);

  const run = async (action: () => Promise<unknown>, failTitle: string, done?: () => void) => {
    setBusy(true);
    try {
      await action();
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      done?.();
    } catch (e) {
      Alert.alert(failTitle, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onLeave = () => {
    const others = players.filter((p) => p.user.id !== meId);
    const heir = [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
    const penalty = late && others.length > 0 ? `It's within ${LATE_LEAVE_HOURS} hours of kickoff, so this counts as a missed game. ` : "";
    const message = !host
      ? penalty || "No effect on your reliability score."
      : heir
        ? `${penalty}${heir.user.name} will take over as host.`
        : "You're the only player, so leaving will cancel the game.";
    Alert.alert(host ? "Leave your game?" : "Leave this game?", message, [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => run(() => leaveGame(game.id), "Couldn't leave", () => router.back()) },
    ]);
  };

  const onCancel = () =>
    Alert.alert("Cancel for everyone?", `${late && players.length > 1 ? "This counts as a missed game. " : ""}If you just can't make it, leave instead and someone else will host.`, [
      { text: "Keep game", style: "cancel" },
      { text: "Cancel game", style: "destructive", onPress: () => run(() => cancelGame(game.id), "Couldn't cancel", () => router.back()) },
    ]);

  const row = (p: Participant, index: number) => (
    <View key={p.user.id}>
      {index > 0 ? <Divider inset={spacing.md} /> : null}
      <Pressable
        onPress={() => p.user.id !== meId && router.push({ pathname: "/user/[id]", params: { id: p.user.id } })}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 9, paddingHorizontal: spacing.md }}
      >
        <Avatar user={p.user} size={30} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>
            {p.user.id === meId ? "You" : p.user.name}
          </Text>
          {game.host?.id === p.user.id ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, color: colors.tint }}>Host</Text> : null}
        </View>
        {p.attended === false ? (
          <Badge label="No-show" tone="danger" />
        ) : p.attended ? (
          <Badge label="Showed up" tone="success" icon="checkmark" />
        ) : (
          <>
            {p.confirmed && open ? <Icon name="checkmark.circle.fill" size={16} color={colors.success} /> : null}
            <ReliabilityBadge user={p.user} />
          </>
        )}
      </Pressable>
    </View>
  );

  const fact = (icon: string, label: string, value: string, onPress?: () => void) => (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md }}>
      <Icon name={icon} size={18} color={colors.tint} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>{label}</Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>{value}</Text>
      </View>
      {onPress ? <Icon name="arrow.up.right" size={12} color={colors.textTertiary} /> : null}
    </Pressable>
  );

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {game.status === "cancelled" ? <Badge label="Cancelled" tone="danger" /> : null}
          {game.status === "completed" || (started && game.status === "open") ? <Badge label={hasEnded(game, new Date(now)) ? "Finished" : "In progress"} /> : null}
          {open ? <Badge label={fill.label} tone={fill.kind === "needs" ? "warning" : "success"} /> : null}
          <Badge label={minReliabilityLabel(game.minReliability)} tone={game.minReliability ? "info" : "neutral"} />
          <Badge label={skillLabel(game.skill)} />
        </View>

        {canConfirm ? (
          <Card tone="maize">
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text }}>Still in?</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 21, color: colors.textSecondary }}>
                {late ? "Can’t make it? Leaving now counts as a missed game." : `Can’t make it? Leave by ${formatTime(leaveBy)} so it doesn’t count as a miss.`}
              </Text>
              <Button label="I'll be there" variant="primary" size="md" icon="checkmark" loading={busy} onPress={() => run(() => confirmSpot(game.id), "Couldn't confirm")} />
            </View>
          </Card>
        ) : null}

        {marking ? (
          <Card tone="maize">
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text }}>Who showed up?</Text>
              <Button label="Mark attendance" variant="primary" size="md" icon="checklist" onPress={() => router.push({ pathname: "/attendance/[id]", params: { id: game.id } })} />
            </View>
          </Card>
        ) : null}

        <Card padding={0}>
          {fact("clock", "When", `${formatWhen(game.startsAt)} – ${formatTime(gameEnd(game))} (${formatDuration(game.durationMin)})`)}
          <Divider inset={spacing.md} />
          {fact("mappin.and.ellipse", "Where", placeName(game), () => Linking.openURL(mapsUrl(game)))}
          {game.notes ? (
            <>
              <Divider inset={spacing.md} />
              {fact("text.bubble", "From the host", game.notes)}
            </>
          ) : null}
        </Card>

        <Card padding={0}>
          <Text style={{ fontFamily: fonts.display, fontSize: typeScale.subtitle, color: colors.text, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
            Players — {players.length} of {game.capacity}
          </Text>
          {players.length > 0 ? players.map(row) : <EmptyState icon="person.2" title="Be the first in" body="Games fill faster once someone commits." />}
          {open && spotsLeft > 0 ? (
            <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.label, color: colors.success, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md }}>
              {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left · game on at {game.minPlayers}
            </Text>
          ) : (
            <View style={{ height: spacing.xs }} />
          )}
        </Card>

        {host && open ? (
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Button label="Edit game" variant="secondary" size="md" icon="pencil" fullWidth onPress={() => router.push({ pathname: "/post-game", params: { edit: game.id } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Cancel game" variant="danger" size="md" icon="xmark" fullWidth onPress={onCancel} />
            </View>
          </View>
        ) : null}

      </ScrollView>

      {open ? (
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: bottomInset + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
          {status === null ? (
            <>
              {!allowed && me ? (
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.danger, textAlign: "center" }}>
                  This game needs {game.minReliability}%+ reliability. You’re at {me.reliability}%.
                </Text>
              ) : null}
              <Button
                label={fill.kind === "full" ? "Game is full" : "Join this game"}
                variant="maize"
                fullWidth
                disabled={!allowed || fill.kind === "full"}
                loading={busy}
                onPress={() => run(() => joinGame(game.id), "Couldn't join")}
              />
            </>
          ) : (
            <Button label={host ? "Leave game" : "Leave"} variant="outline" fullWidth loading={busy} onPress={onLeave} />
          )}
        </View>
      ) : null}
    </>
  );
}
