import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SoccerLevelPicker, SportPick } from "@/components/soccer-level-picker";
import { useAppTheme } from "@/components/theme";
import { Chip, Field, FieldLabel } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Header, HeaderTextButton } from "@/components/ui/header";
import { spacing } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { saveProfile } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { ClassYear } from "@/lib/types";

const YEARS: ClassYear[] = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];

export default function ProfileEdit() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAppStore((s) => s.me)!;
  const [name, setName] = useState(me.name);
  const [classYear, setClassYear] = useState<ClassYear | null>(me.classYear);
  const [bio, setBio] = useState(me.bio);
  const [sports, setSports] = useState<SportPick[]>(me.sports.filter((s) => s.sport === "soccer"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({ name: name.trim(), classYear, bio: bio.trim(), sports });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Edit profile" right={<HeaderTextButton label="Cancel" onPress={() => router.back()} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Name</FieldLabel>
          <Field value={name} onChangeText={setName} autoCapitalize="words" maxLength={50} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Year</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {YEARS.map((y) => (
              <Chip key={y} label={y} selected={classYear === y} onPress={() => setClassYear(y)} />
            ))}
          </View>
        </View>
        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Bio</FieldLabel>
          <Field value={bio} onChangeText={setBio} placeholder="Former high school midfielder, free most days after 4" multiline maxLength={160} style={{ minHeight: 76, textAlignVertical: "top" }} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <FieldLabel>Soccer level</FieldLabel>
          <SoccerLevelPicker value={sports} onChange={setSports} />
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.cardSolid }}>
        <Button label="Save" variant="maize" fullWidth disabled={name.trim().length < 2 || sports.length === 0} loading={saving} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}
