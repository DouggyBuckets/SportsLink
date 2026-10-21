import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, ScrollView, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { ReliabilityCard, soccerLevel } from "@/components/profile-bits";
import { Avatar, EmptyState, SheetHeader } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { blockUser, fetchProfile, reportUser } from "@/lib/api";
import { Profile } from "@/lib/types";

const REPORT_REASONS = ["No-show or flaky", "Unsportsmanlike or aggressive", "Harassment", "Not a student / fake account"];

export default function UserSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [user, setUser] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    fetchProfile(id).then(setUser).catch(() => setUser(null));
  }, [id]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      Alert.alert("Something went wrong", (e as Error).message);
    }
  };

  const report = () =>
    Alert.alert("Report player", "What happened?", [
      ...REPORT_REASONS.map((reason) => ({ text: reason, onPress: () => run(() => reportUser(id, reason)).then(() => Alert.alert("Thanks", "We'll review this report.")) })),
      { text: "Cancel", style: "cancel" as const },
    ]);

  const block = () =>
    Alert.alert("Block this player?", "You won't see each other's games or profiles. They won't be told.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => run(() => blockUser(id)).then(() => router.back()) },
    ]);

  const more = () => {
    const options = ["Report", "Block", "Cancel"];
    const handle = (label: string) => (label === "Report" ? report() : label === "Block" ? block() : undefined);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: options.indexOf("Block") }, (i) => handle(options[i]));
    } else {
      Alert.alert("More", undefined, options.map((o) => ({ text: o, onPress: () => handle(o) })));
    }
  };

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

      <Button label="Report or block" variant="outline" size="md" icon="ellipsis" onPress={more} />
    </ScrollView>
  );
}
