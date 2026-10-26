import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { ReliabilityCard, soccerLevel } from "@/components/profile-bits";
import { Avatar, EmptyState, SheetHeader } from "@/components/ui/bits";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { fetchProfile } from "@/lib/api";
import { Profile } from "@/lib/types";

export default function UserSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [user, setUser] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    fetchProfile(id).then(setUser).catch(() => setUser(null));
  }, [id]);

  if (user === undefined) return <ActivityIndicator color={colors.tint} style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (user === null) {
    return (
      <View style={{ flex: 1, padding: spacing.lg, paddingTop: spacing.xl, backgroundColor: colors.bg }}>
        <SheetHeader title="Player" onClose={() => router.back()} />
        <EmptyState icon="person.slash" title="Profile unavailable" body="This player may have left SportsLink." />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg }}>
      <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
        <Avatar user={user} size={68} />
        <View style={{ flex: 1 }}>
          <SheetHeader title={user.name} subtitle={`${user.classYear ?? "Student"} · Soccer · ${soccerLevel(user)}`} onClose={() => router.back()} />
        </View>
      </View>

      <ReliabilityCard user={user} />

      {user.bio ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 22, color: colors.text }}>{user.bio}</Text> : null}
    </ScrollView>
  );
}
