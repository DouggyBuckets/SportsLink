import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { Avatar, EmptyState, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { markAttendance } from "@/lib/api";
import { formatTime, gameEnd } from "@/lib/dates";
import { joinedPlayers } from "@/lib/selectors";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/ui/icon";

// Host-only, after kickoff. Everyone starts ticked (most people do show up);
// the host taps the no-shows. Anyone left unticked lowers their reliability score.
export default function Attendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const meId = useAppStore((s) => s.me?.id);
  const others = game ? joinedPlayers(game).filter((p) => p.user.id !== meId) : [];
  const [present, setPresent] = useState(() => new Set(others.filter((p) => p.attended !== false).map((p) => p.user.id)));
  const [saving, setSaving] = useState(false);
  const close = <HeaderTextButton label="Cancel" onPress={() => router.back()} />;

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Mark attendance" right={close} />
        <EmptyState icon="questionmark.circle" title="This game is gone" body="It may have been removed." />
      </View>
    );
  }

  const toggle = (userId: string) => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    const next = new Set(present);
    if (!next.delete(userId)) next.add(userId);
    setPresent(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      // The host was there by definition.
      await markAttendance(game.id, [...present, ...(meId ? [meId] : [])]);
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save attendance", (e as Error).message);
      setSaving(false);
    }
  };

  const noShows = others.length - present.size;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mark attendance" subtitle={`${gameTitle(game)} · ended ${formatTime(gameEnd(game))}`} right={close} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <SectionTitle title="Who showed up?" />
        <Card padding={0}>
          {others.length === 0 ? (
            <EmptyState icon="person" title="Nobody else joined" body="There's no one to mark for this game." />
          ) : (
            others.map((p, i) => {
              const here = present.has(p.user.id);
              return (
                <View key={p.user.id}>
                  {i > 0 ? <Divider inset={spacing.md} /> : null}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: here }}
                    accessibilityLabel={`${p.user.name}, ${here ? "showed up" : "no-show"}`}
                    onPress={() => toggle(p.user.id)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md, backgroundColor: pressed ? colors.fill : "transparent" })}
                  >
                    <Avatar user={p.user} size={30} />
                    <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>{p.user.name}</Text>
                    {here ? null : <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.label, color: colors.danger }}>No-show</Text>}
                    <Icon name={here ? "checkmark.circle.fill" : "circle"} size={26} color={here ? colors.success : colors.textTertiary} />
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        <Button label={noShows > 0 ? `Save attendance · ${noShows} no-show${noShows === 1 ? "" : "s"}` : "Save attendance"} variant="maize" fullWidth loading={saving} onPress={save} />
      </View>
    </View>
  );
}
