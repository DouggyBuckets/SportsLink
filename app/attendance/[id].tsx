import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MarkCreditBadge } from "@/components/attendance-bits";
import { useAppTheme } from "@/components/theme";
import { Avatar, EmptyState, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { markAttendance } from "@/lib/api";
import { formatTime, gameEnd } from "@/lib/dates";
import { MARK_CREDIT, MARK_LABEL } from "@/lib/reliability";
import { HOST_MARK_HOURS, joinedPlayers } from "@/lib/selectors";
import { gameTitle } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { AttendanceMark } from "@/lib/types";

const MARKS: AttendanceMark[] = ["present", "late", "left_early", "no_show"];

// Host-only, from kickoff until HOST_MARK_HOURS after the game. Everyone
// starts as present (most people do show up); the host changes the rest.
// Late and left early earn partial credit, a no-show none.
export default function Attendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const meId = useAppStore((s) => s.me?.id);
  const others = game ? joinedPlayers(game).filter((p) => p.user.id !== meId) : [];
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>(() => Object.fromEntries(others.map((p) => [p.user.id, p.mark ?? "present"])));
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

  const setMark = (userId: string, mark: AttendanceMark) => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    setMarks((m) => ({ ...m, [userId]: mark }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // The host was there by definition.
      await markAttendance(game.id, { ...marks, ...(meId ? { [meId]: "present" } : {}) });
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save attendance", (e as Error).message);
      setSaving(false);
    }
  };

  const counts = MARKS.slice(1)
    .map((m) => ({ m, n: Object.values(marks).filter((x) => x === m).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${MARK_LABEL[c.m].toLowerCase()}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Mark attendance" subtitle={`${gameTitle(game)} · ended ${formatTime(gameEnd(game))}`} right={close} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <SectionTitle title="How did each player do?" />
        <Card padding={0}>
          {others.length === 0 ? (
            <EmptyState icon="person" title="Nobody else joined" body="There's no one to mark for this game." />
          ) : (
            others.map((p, i) => (
              <View key={p.user.id}>
                {i > 0 ? <Divider inset={spacing.md} /> : null}
                <View style={{ gap: spacing.xs, paddingVertical: 11, paddingHorizontal: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Avatar user={p.user} size={30} />
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>
                      {p.user.name}
                    </Text>
                    <MarkCreditBadge mark={marks[p.user.id]} />
                  </View>
                  <SegmentedTabs value={marks[p.user.id]} onChange={(m) => setMark(p.user.id, m)} options={MARKS.map((m) => ({ value: m, label: MARK_LABEL[m] }))} />
                </View>
              </View>
            ))
          )}
        </Card>

        <Card>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.body, color: colors.text }}>How each mark affects the score</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 4 }}>
              {MARKS.map((m) => (
                <View key={m} style={{ width: "50%", flexDirection: "row", justifyContent: "space-between", paddingRight: m === "present" || m === "left_early" ? spacing.lg : 0 }}>
                  <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>{MARK_LABEL[m]}</Text>
                  <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.label, color: m === "present" ? colors.success : m === "no_show" ? colors.danger : colors.warning, fontVariant: ["tabular-nums"] }}>
                    {MARK_CREDIT[m] * 100}%
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, lineHeight: 17, color: colors.textTertiary }}>
              You have {HOST_MARK_HOURS} hours after the game. After that, the players vote instead.
            </Text>
          </View>
        </Card>
      </ScrollView>
      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        {counts.length ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, color: colors.textSecondary, textAlign: "center" }}>{counts.join(" · ")}</Text> : null}
        <Button label="Save attendance" variant="maize" fullWidth loading={saving} onPress={save} />
      </View>
    </View>
  );
}
