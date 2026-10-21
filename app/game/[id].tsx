import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FieldBookingRow } from "@/components/field-booking";
import { useAppTheme } from "@/components/theme";
import { useNow } from "@/hooks/use-now";
import { Avatar, Badge, EmptyState, ReliabilityBadge } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";
import { cancelGame, confirmSpot, fetchMessages, joinGame, leaveGame, sendMessage, subscribeToMessages } from "@/lib/api";
import { formatDuration, formatTime, formatWhen, gameEnd } from "@/lib/dates";
import { fieldRules } from "@/lib/fields";
import { mapsUrl, placeName } from "@/lib/locations";
import { isLateLeave, LATE_LEAVE_HOURS, meetsMinimum, minReliabilityLabel } from "@/lib/reliability";
import { fillState, hasEnded, hasStarted, isHost, joinedPlayers, myStatus, needsAttendance } from "@/lib/selectors";
import { gameTitle, skillLabel } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { Game, Message, Participant } from "@/lib/types";

const CONFIRM_WINDOW_MS = 24 * 60 * 60_000;
const NO_MESSAGES: Message[] = [];

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const meId = useAppStore((s) => s.me?.id);
  const [tab, setTab] = useState<"details" | "chat">("details");
  const close = <HeaderTextButton label="Close" onPress={() => router.back()} />;

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Game not found" right={close} />
        <EmptyState icon="questionmark.circle" title="This game is gone" body="It may have been cancelled or removed by the host." />
      </View>
    );
  }

  const inGame = myStatus(game, meId) !== null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={gameTitle(game)} subtitle={`${placeName(game)} · ${formatWhen(game.startsAt)}`} right={close} />
      {/* Chat follows membership: you get it by joining, lose it by leaving. */}
      {inGame ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "details", label: "Details" },
              { value: "chat", label: "Group chat" },
            ]}
          />
        </View>
      ) : null}

      {tab === "chat" && inGame ? <Chat game={game} bottomInset={insets.bottom} /> : <Details game={game} bottomInset={insets.bottom} />}
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

  // Friends come after MVP1; for now, share a link to the game.
  const onShare = () => Share.share({ message: `Join my ${gameTitle(game)} game on SportsLink: ${formatWhen(game.startsAt)} at ${placeName(game)}. sportslink://game/${game.id}` });

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
            {p.confirmed && open ? <Image source="sf:checkmark.circle.fill" style={{ width: 16, height: 16, tintColor: colors.success }} /> : null}
            <ReliabilityBadge user={p.user} />
          </>
        )}
      </Pressable>
    </View>
  );

  const fact = (icon: string, label: string, value: string, onPress?: () => void) => (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md }}>
      <Image source={`sf:${icon}`} style={{ width: 18, height: 18, tintColor: colors.tint }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>{label}</Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>{value}</Text>
      </View>
      {onPress ? <Image source="sf:arrow.up.right" style={{ width: 12, height: 12, tintColor: colors.textTertiary }} /> : null}
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
          {fieldRules(game.locationId) ? (
            <>
              <Divider inset={spacing.md} />
              <FieldBookingRow game={game} host={host && game.status === "open" && !hasEnded(game, new Date(now))} />
            </>
          ) : null}
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
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Button label="Share" variant="primary" icon="square.and.arrow.up" fullWidth onPress={onShare} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Leave" variant="outline" fullWidth loading={busy} onPress={onLeave} />
              </View>
            </View>
          )}
        </View>
      ) : null}
    </>
  );
}

function Chat({ game, bottomInset }: { game: Game; bottomInset: number }) {
  const { colors } = useAppTheme();
  const meId = useAppStore((s) => s.me?.id);
  const messages = useAppStore((s) => s.messages[game.id] ?? NO_MESSAGES);
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    fetchMessages(game.id).catch(() => {});
    return subscribeToMessages(game.id);
  }, [game.id]);

  const send = () => {
    const body = draft;
    setDraft("");
    sendMessage(game.id, body).catch((e) => {
      setDraft(body);
      Alert.alert("Message not sent", (e as Error).message);
    });
  };

  return (
    <>
      <ScrollView
        ref={scroll}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xs, gap: 6, flexGrow: 1, justifyContent: messages.length ? "flex-end" : "center" }}
      >
        {messages.length === 0 ? <EmptyState icon="bubble.left.and.bubble.right" title="Say hi to the group" body="Sort out who's bringing a ball, where exactly to meet, or let people know you're running late." /> : null}
        {messages.map((m, i) => {
          if (!m.user) {
            return (
              <Text key={m.id} style={{ alignSelf: "center", fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, color: colors.textTertiary, paddingVertical: 6, textAlign: "center" }}>
                {m.body}
              </Text>
            );
          }
          const isMine = m.user.id === meId;
          const showName = !isMine && messages[i - 1]?.user?.id !== m.user.id;
          return (
            <View key={m.id} style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "80%", flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
              {!isMine ? <View style={{ width: 28 }}>{showName ? <Avatar user={m.user} size={28} /> : null}</View> : null}
              <View style={{ flexShrink: 1, gap: 2 }}>
                {showName ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textTertiary, marginLeft: 12 }}>{m.user.name.split(" ")[0]}</Text> : null}
                <View style={{ backgroundColor: isMine ? colors.header : colors.cardSolid, borderWidth: isMine ? 0 : 1, borderColor: colors.cardBorder, borderRadius: 18, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 9 }}>
                  <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 21, color: isMine ? colors.onHeader : colors.text }}>{m.body}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: bottomInset + spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={game.status === "cancelled" ? "This game was cancelled" : "Message the group"}
          editable={game.status !== "cancelled"}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.tint}
          multiline
          maxLength={500}
          style={{ flex: 1, maxHeight: 110, backgroundColor: colors.fill, borderRadius: radius.lg, borderCurve: "continuous", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontFamily: fonts.body, fontSize: typeScale.body, color: colors.text }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim()}
          onPress={send}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: draft.trim() ? 1 : 0.35 }}
        >
          <Image source="sf:arrow.up" style={{ width: 17, height: 17, tintColor: colors.onPrimary }} />
        </Pressable>
      </View>
    </>
  );
}
