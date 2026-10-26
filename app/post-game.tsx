import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { useNow } from "@/hooks/use-now";
import { Badge, Chip, Field, FieldLabel } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { Divider } from "@/components/ui/list-section";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { postGame, updateGame } from "@/lib/api";
import { fitsSchedule } from "@/lib/availability";
import { formatDuration, nextOccurrence } from "@/lib/dates";
import { locationsForSport, OTHER_LOCATION_ID } from "@/lib/locations";
import { joinedPlayers } from "@/lib/selectors";
import { MIN_RELIABILITY_OPTIONS } from "@/lib/reliability";
import { formatSizing, SKILLS, SOCCER, sportMeta } from "@/lib/sports";
import { useAppStore } from "@/lib/store";
import { NewGame, SkillLevel } from "@/lib/types";
import { Icon } from "@/components/ui/icon";

type StepperProps = { label: string; hint?: string; value: number; min: number; max: number; step?: number; display?: string; onChange: (n: number) => void };

function Stepper({ label, hint, value, min, max, step = 1, display, onChange }: StepperProps) {
  const { colors } = useAppTheme();
  const button = (icon: string, next: number) => {
    const disabled = next < min || next > max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${icon === "minus" ? "Decrease" : "Increase"} ${label}`}
        disabled={disabled}
        hitSlop={6}
        onPress={() => {
          if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
          onChange(next);
        }}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fill, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
      >
        <Icon name={icon} size={14} color={colors.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>{label}</Text>
        {hint ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>{hint}</Text> : null}
      </View>
      {button("minus", value - step)}
      <Text style={{ minWidth: display ? 92 : 30, textAlign: "center", fontFamily: fonts.display, fontSize: display ? 16 : 20, color: colors.text, fontVariant: ["tabular-nums"] }}>{display ?? value}</Text>
      {button("plus", value + step)}
    </View>
  );
}

// Create and edit share one form: `?edit=<gameId>` loads an existing game.
// `day` and `start` params prefill a new one's time.
export default function PostGame() {
  const params = useLocalSearchParams<{ edit?: string; day?: string; start?: string }>();
  const { colors, scheme } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const availability = useAppStore((s) => s.availability);
  const editing = useAppStore((s) => (params.edit ? s.games.find((g) => g.id === params.edit) : undefined));
  const lockedIn = editing ? joinedPlayers(editing).length : 1;
  const now = useNow();

  // Default to 5pm today, or the next free slot an overlap suggestion named.
  const [when, setWhen] = useState(() => {
    if (editing) return new Date(editing.startsAt);
    const today = new Date();
    if (params.day !== undefined) return nextOccurrence(Number(params.day), Number(params.start ?? 17 * 60));
    return nextOccurrence(today.getDay(), 17 * 60);
  });

  const sport = SOCCER;
  const [format, setFormat] = useState(editing?.format ?? sportMeta(sport).formats[0]);
  const [locationId, setLocationId] = useState(editing?.locationId ?? locationsForSport(sport)[0].id);
  const [locationNote, setLocationNote] = useState(editing?.locationNote ?? "");
  const [durationMin, setDurationMin] = useState(editing?.durationMin ?? 90);
  const [capacity, setCapacity] = useState(editing ? Math.max(editing.capacity, formatSizing(editing.format, sport).minPlayers) : formatSizing(sportMeta(sport).formats[0], sport).capacity);
  const [skill, setSkill] = useState<SkillLevel>(editing?.skill ?? "any");
  const [minReliability, setMinReliability] = useState(editing?.minReliability ?? 0);
  // Friends-only games come back with friends, after MVP1.
  const visibility: NewGame["visibility"] = editing?.visibility ?? "campus";
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const meta = sportMeta(sport);
  const places = locationsForSport(sport);
  const startsAt = when;
  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), []);
  const inPast = startsAt.getTime() < now + 10 * 60_000;
  const fitsMe = fitsSchedule({ startsAt: startsAt.toISOString(), durationMin }, availability);
  const customPlace = locationId === OTHER_LOCATION_ID;
  const valid = !inPast && (!customPlace || locationNote.trim().length >= 3);

  // The format sets how many are needed to play (the "Game on" threshold:
  // both full sides). The host only picks the max; anything above the
  // needed count is room for subs. Never below the people already in.
  const minPlayers = formatSizing(format, sport).minPlayers;
  const minCapacity = Math.max(minPlayers, lockedIn);
  const applyFormat = (f: string) => {
    const subs = Math.max(0, capacity - minPlayers);
    const needed = formatSizing(f, sport).minPlayers;
    setFormat(f);
    setCapacity(Math.min(40, Math.max(needed + subs, lockedIn)));
  };

  const submit = async () => {
    const input: NewGame = { sport, customSport: "", format, locationId, locationNote: locationNote.trim(), startsAt: startsAt.toISOString(), durationMin, capacity, minPlayers, skill, minReliability, visibility, notes: notes.trim() };
    setSaving(true);
    try {
      const game = editing ? await updateGame(editing.id, input) : await postGame(input);
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (editing) router.back();
      else router.replace({ pathname: "/game/[id]", params: { id: game.id } });
    } catch (e) {
      Alert.alert(editing ? "Couldn't save changes" : "Couldn't post game", (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={editing ? "Edit game" : "Post a soccer game"}
        right={<HeaderTextButton label="Cancel" onPress={() => router.back()} />}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Format</FieldLabel>
          <SegmentedTabs value={format} onChange={applyFormat} options={meta.formats.map((f) => ({ value: f, label: f }))} />
        </View>

        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Where</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
            {places.map((l) => (
              <Chip key={l.id} label={l.indoor ? `${l.name} (indoor)` : l.name} icon={l.id === OTHER_LOCATION_ID ? "mappin.and.ellipse" : undefined} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
            ))}
          </ScrollView>
          <Field value={locationNote} onChangeText={setLocationNote} placeholder={customPlace ? "Address or place name" : "Which field or where to meet (optional)"} maxLength={60} />
        </View>

        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <FieldLabel>When</FieldLabel>
            {inPast ? <Badge label="That time has passed" tone="danger" /> : fitsMe ? <Badge label="In your free time" tone="success" icon="checkmark" /> : <Badge label="Outside your free time" tone="warning" />}
          </View>
          {/* Native pickers: any date, any time, and the UI students already know. */}
          <Card padding={0}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingLeft: spacing.md, paddingRight: spacing.xs }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>Date</Text>
              <DateTimePicker value={when} mode="date" display="compact" minimumDate={today} themeVariant={scheme} accentColor={colors.tint} onValueChange={(_, d) => setWhen(d)} />
            </View>
            <Divider inset={spacing.md} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingLeft: spacing.md, paddingRight: spacing.xs }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>Start time</Text>
              <DateTimePicker value={when} mode="time" display="compact" minuteInterval={5} themeVariant={scheme} accentColor={colors.tint} onValueChange={(_, d) => setWhen(d)} />
            </View>
            <Divider inset={spacing.md} />
            <Stepper label="How long" value={durationMin} min={15} max={480} step={15} display={formatDuration(durationMin)} onChange={setDurationMin} />
          </Card>
        </View>

        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Players</FieldLabel>
          <Card padding={0}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.text }}>Needed to play</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>Set by {format} · Game on at this many</Text>
              </View>
              <Text style={{ minWidth: 30, marginRight: 42, textAlign: "center", fontFamily: fonts.display, fontSize: 20, color: colors.text, fontVariant: ["tabular-nums"] }}>{minPlayers}</Text>
            </View>
            <Divider inset={spacing.md} />
            <Stepper
              label="Max players"
              hint={capacity > minPlayers ? `${capacity - minPlayers} sub spot${capacity - minPlayers === 1 ? "" : "s"}${lockedIn > 1 ? ` · ${lockedIn} already in` : ""}` : "No subs"}
              value={capacity}
              min={minCapacity}
              max={40}
              onChange={setCapacity}
            />
          </Card>
        </View>

        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Level</FieldLabel>
          <SegmentedTabs value={skill} onChange={setSkill} options={SKILLS.map((s) => ({ value: s.value, label: s.value === "any" ? "Any" : s.label }))} />
        </View>

        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Minimum reliability</FieldLabel>
          <SegmentedTabs
            value={String(minReliability)}
            onChange={(v) => setMinReliability(Number(v))}
            options={MIN_RELIABILITY_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? "Anyone" : `${n}%+` }))}
          />
        </View>


        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Notes</FieldLabel>
          <Field value={notes} onChangeText={setNotes} placeholder="Bring a dark and a light shirt, I have a ball and cones..." multiline maxLength={280} style={{ minHeight: 84, textAlignVertical: "top" }} />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        <Button label={editing ? "Save changes" : "Post game"} variant="maize" fullWidth disabled={!valid} loading={saving} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}
