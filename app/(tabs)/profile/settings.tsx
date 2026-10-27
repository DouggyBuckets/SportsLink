import { useState } from "react";
import { Modal, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { Field, FieldLabel } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { ListSection } from "@/components/ui/list-section";
import { Screen } from "@/components/ui/screen";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { changePassword, deleteAccount, MIN_PASSWORD_LENGTH, resetDemoData, signOut } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { DEMO } from "@/lib/supabase";

export default function Settings() {
  const { colors } = useAppTheme();
  const theme = useAppStore((s) => s.themeOverride);
  const patch = useAppStore((s) => s.patch);
  // Android has no Alert.prompt, so it gets a small modal instead.
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const confirmDelete = () =>
    Alert.alert("Delete your account?", "Your profile and free time are permanently removed. Games you host pass to another player. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => deleteAccount().catch((e) => Alert.alert("Couldn't delete account", (e as Error).message)) },
    ]);

  const savePassword = (value: string) =>
    changePassword(value)
      .then(() => Alert.alert("Password changed"))
      .catch((e) => Alert.alert("Couldn't change password", (e as Error).message));

  const promptPassword = () => {
    if (process.env.EXPO_OS !== "ios") {
      setNewPassword("");
      setPasswordModal(true);
      return;
    }
    Alert.prompt(
      "Change password",
      `At least ${MIN_PASSWORD_LENGTH} characters.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (value?: string) => savePassword(value ?? ""),
        },
      ],
      "secure-text"
    );
  };

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

      <Modal visible={passwordModal} transparent animationType="fade" onRequestClose={() => setPasswordModal(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: 16, backgroundColor: colors.cardSolid }}>
            <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.subtitle, color: colors.text }}>Change password</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, color: colors.textSecondary }}>At least {MIN_PASSWORD_LENGTH} characters.</Text>
            <Field value={newPassword} onChangeText={setNewPassword} secureTextEntry autoFocus autoCapitalize="none" autoComplete="new-password" />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs }}>
              <Button label="Cancel" variant="outline" size="md" onPress={() => setPasswordModal(false)} />
              <Button
                label="Save"
                size="md"
                onPress={() => {
                  setPasswordModal(false);
                  savePassword(newPassword);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
