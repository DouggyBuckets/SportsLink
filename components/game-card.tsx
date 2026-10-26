import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { Badge, ReliabilityBadge } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { joinGame } from "@/lib/api";
import { formatWhen } from "@/lib/dates";
import { placeName } from "@/lib/locations";
import { meetsMinimum, minReliabilityLabel } from "@/lib/reliability";
import { fillState, joinedPlayers, myStatus } from "@/lib/selectors";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { Game } from "@/lib/types";

// "Jim Kowalski" -> "Jim K."
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first || "Player";
};

type GameCardProps = {
  game: Game;
  // false dims the card (outside the viewer's free time). The feed's section
  // headings already say which games fit, so cards don't repeat it.
  fits?: boolean;
};

export function GameCard({ game, fits }: GameCardProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const [joining, setJoining] = useState(false);

  const title = gameTitle(game);
  const players = joinedPlayers(game);
  const fill = fillState(game);
  const status = myStatus(game, me?.id);
  const allowed = !me || meetsMinimum(me, game.minReliability);

  const onJoin = async () => {
    setJoining(true);
    try {
      await joinGame(game.id);
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Couldn't join", (e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const detail = (text: string, strong = false) => (
    <Text numberOfLines={1} style={{ fontFamily: strong ? fonts.bodySemiBold : fonts.body, fontSize: typeScale.body, color: strong ? colors.text : colors.textSecondary }}>
      {text}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatWhen(game.startsAt)} at ${placeName(game)}`}
      onPress={() => router.push({ pathname: "/game/[id]", params: { id: game.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ opacity: fits === false && status === null ? 0.7 : 1 }}>
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: fill.kind === "needs" ? colors.warning : colors.success }} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.display, fontSize: typeScale.subtitle, color: colors.text }}>
              {title}
            </Text>
            {status === "joined" ? <Badge label="You're in" tone="maize" /> : null}
          </View>

          <View style={{ paddingLeft: 17, gap: 3 }}>
            {detail(placeName(game))}
            {detail(formatWhen(game.startsAt), true)}
            {game.host ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>Host: {game.host.id === me?.id ? "You" : shortName(game.host.name)}</Text>
                <ReliabilityBadge user={game.host} />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 6 }}>
              <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
                <Badge label={minReliabilityLabel(game.minReliability)} tone={game.minReliability ? "info" : "neutral"} />
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] }}>
                  {players.length} of {game.capacity} players
                  <Text style={{ color: fill.kind === "needs" ? colors.warning : colors.success }}> · {fill.label}</Text>
                </Text>
              </View>
              {status !== null || fill.kind === "full" ? null : allowed ? (
                <Button label="Join" size="sm" loading={joining} onPress={onJoin} />
              ) : (
                <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.caption, color: colors.danger }}>Needs {game.minReliability}%</Text>
              )}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
