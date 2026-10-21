import { Alert, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { FieldLabel } from "@/components/ui/bits";
import { ListSection } from "@/components/ui/list-section";
import { Screen } from "@/components/ui/screen";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { changePassword, deleteAccount, MIN_PASSWORD_LENGTH, resetDemoData, signOut } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { DEMO } from "@/lib/supabase";

export default function Settings() {
  const { colors } = useAppTheme();
  const theme = useAppStore((s) => s.themeOverride);
  const patch = useAppStore((s) => s.patch);

  const confirmDelete = () =>
    Alert.alert("Delete your account?", "Your profile and free time are permanently removed. Games you host pass to another player. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => deleteAccount().catch((e) => Alert.alert("Couldn't delete account", (e as Error).message)) },
    ]);

  const promptPassword = () =>
    Alert.prompt(
      "Change password",
      `At least ${MIN_PASSWORD_LENGTH} characters.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (value?: string) =>
            changePassword(value ?? "")
              .then(() => Alert.alert("Password changed"))
              .catch((e) => Alert.alert("Couldn't change password", (e as Error).message)),
        },
      ],
      "secure-text"
    );

  return (
    <Screen nativeHeader bottomInset={140}>
      <View style={{ gap: spacing.xs }}>
        <FieldLabel>Appearance</FieldLabel>
        <SegmentedTabs
          value={theme}
          onChange={(themeOverride) => patch({ themeOverride })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </View>

      {DEMO ? (
        <ListSection
          rows={[{ key: "reset", icon: "arrow.counterclockwise", iconColor: "#0B3F73", label: "Reset demo data", onPress: () => resetDemoData().then(() => Alert.alert("Demo data reset")) }]}
        />
      ) : null}

      <ListSection
        rows={[
          { key: "password", icon: "key.fill", iconColor: "#52627A", label: "Change password", onPress: promptPassword },
          { key: "signout", icon: "rectangle.portrait.and.arrow.right", iconColor: "#0B3F73", label: "Sign out", onPress: () => signOut() },
          { key: "delete", icon: "trash.fill", iconColor: colors.danger, label: "Delete account", destructive: true, onPress: confirmDelete },
        ]}
      />

      <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary, textAlign: "center" }}>
        SportsLink 1.0{DEMO ? " · Demo mode (no backend connected)" : ""}
        {"\n"}Not affiliated with the University of Michigan.
      </Text>
    </Screen>
  );
}
