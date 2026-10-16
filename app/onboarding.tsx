import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AVAILABILITY_PRESETS, AvailabilityGrid } from "@/components/availability-grid";
import { SoccerLevelPicker, SportPick } from "@/components/soccer-level-picker";
import { useAppTheme } from "@/components/theme";
import { Chip, Field, FieldLabel } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { saveAvailability, saveProfile, signOut } from "@/lib/api";
import { cellsToBlocks, weeklyFreeHours } from "@/lib/availability";
import { useAppStore } from "@/lib/store";
import { ClassYear } from "@/lib/types";

const YEARS: ClassYear[] = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];

const STEPS = [
  { title: "First, who are you?", body: "This is how other players will see you on a roster." },
  { title: "How do you play?", body: "SportsLink is pickup soccer for now. Your level helps hosts find a good match." },
  { title: "When are you free?", body: "Drag over the hours you're usually open - around class, work, clubs. Only you can see this." },
];

export default function Onboarding() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const me = useAppStore((s) => s.me);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(me?.name ?? "");
  const [classYear, setClassYear] = useState<ClassYear | null>(me?.classYear ?? null);
  const [sports, setSports] = useState<SportPick[]>(me?.sports.filter((s) => s.sport === "soccer") ?? []);
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const blocks = cellsToBlocks(cells);
  const canContinue = [name.trim().length >= 2 && classYear !== null, sports.length > 0, cells.size > 0][step];

  const finish = async () => {
    setSaving(true);
    try {
      await saveAvailability(blocks);
      await saveProfile({ name: name.trim(), classYear, bio: "", sports }, { finishOnboarding: true });
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md, backgroundColor: colors.header }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 38 }}>
          {step > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => setStep(step - 1)}>
              <Image source="sf:chevron.left" style={{ width: 16, height: 16, tintColor: colors.onHeader }} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
            {STEPS.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.maize : "rgba(255,255,255,0.25)" }} />
            ))}
          </View>
          {step === 0 ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={signOut}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.onHeaderMuted }}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <Animated.View key={step} entering={FadeIn.duration(250)} style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: fonts.display, fontSize: typeScale.largeTitle, letterSpacing: -0.5, color: colors.text }}>{STEPS[step].title}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.subtitle, lineHeight: 24, color: colors.textSecondary }}>{STEPS[step].body}</Text>
          </View>

          {step === 0 ? (
            <>
              <View style={{ gap: spacing.xs }}>
                <FieldLabel>Name</FieldLabel>
                <Field value={name} onChangeText={setName} placeholder="First and last name" autoFocus autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="done" />
              </View>
              <View style={{ gap: spacing.xs }}>
                <FieldLabel>Year</FieldLabel>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {YEARS.map((y) => (
                    <Chip key={y} label={y} selected={classYear === y} onPress={() => setClassYear(y)} />
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {step === 1 ? <SoccerLevelPicker value={sports} onChange={setSports} /> : null}

          {step === 2 ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {AVAILABILITY_PRESETS.map((p) => (
                  <Chip key={p.label} label={p.label} icon="wand.and.stars" onPress={() => setCells(new Set([...cells, ...p.cells]))} />
                ))}
                {cells.size > 0 ? <Chip label="Clear" icon="xmark" onPress={() => setCells(new Set())} /> : null}
              </View>
              <AvailabilityGrid cells={cells} onChange={setCells} />
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.sm, paddingTop: spacing.sm, gap: spacing.xs }}>
        {step === 2 && cells.size > 0 ? (
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.textSecondary, textAlign: "center" }}>
            {weeklyFreeHours(blocks)} free hours a week
          </Text>
        ) : null}
        <Button
          label={step === 2 ? "Find my games" : "Continue"}
          variant={step === 2 ? "maize" : "primary"}
          fullWidth
          disabled={!canContinue}
          loading={saving}
          onPress={() => (step === 2 ? finish() : setStep(step + 1))}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
