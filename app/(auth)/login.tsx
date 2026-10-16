import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";
import { checkUserExists, isUmichEmail, MIN_PASSWORD_LENGTH, signInOrSignUp, UMICH_DOMAIN } from "@/lib/api";

// One flow for sign-in and sign-up. The student types only their uniqname
// (the domain is fixed, so a non-umich address can't even be entered), then
// a password: "Welcome back" if the account exists, "Create a password" if not.
export default function Login() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<"email" | "password">("email");
  const [uniqname, setUniqname] = useState("");
  const [exists, setExists] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = `${uniqname}@${UMICH_DOMAIN}`;
  const valid = isUmichEmail(email);

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      setExists(await checkUserExists(email));
      setPassword("");
      setStep("password");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInOrSignUp(email, password, exists);
      // Success: the root layout's guards swap this stack out.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    if (step === "password") setStep("email");
    else router.back();
  };

  const inputBox = (focused: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.cardSolid,
    borderRadius: radius.md,
    borderCurve: "continuous" as const,
    borderWidth: 1.5,
    borderColor: focused ? colors.tint : colors.cardBorder,
    paddingHorizontal: spacing.md,
  });
  const inputText = { flex: 1, paddingVertical: 17, fontFamily: fonts.bodyMedium, fontSize: 19, color: colors.text };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={back}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.fill, alignItems: "center", justifyContent: "center" }}
        >
          <Image source="sf:chevron.left" style={{ width: 14, height: 14, tintColor: colors.text }} />
        </Pressable>

        {step === "email" ? (
          <Animated.View key="email" entering={FadeIn.duration(250)} style={{ flex: 1, marginTop: spacing.xl, gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ fontFamily: fonts.display, fontSize: typeScale.largeTitle, letterSpacing: -0.8, color: colors.text }}>What’s your{"\n"}uniqname?</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: typeScale.subtitle, lineHeight: 24, color: colors.textSecondary }}>SportsLink is for U-M students only.</Text>
            </View>

            <View style={inputBox(!!uniqname)}>
              <TextInput
                value={uniqname}
                onChangeText={(v) => setUniqname(v.toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, ""))}
                placeholder="uniqname"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.tint}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => valid && next()}
                style={inputText}
              />
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 19, color: colors.textTertiary }}>@{UMICH_DOMAIN}</Text>
            </View>

            <View style={{ flex: 1 }} />
            <Button label="Continue" fullWidth disabled={!valid} loading={busy} onPress={next} />
          </Animated.View>
        ) : (
          <Animated.View key="password" entering={FadeIn.duration(250)} style={{ flex: 1, marginTop: spacing.xl, gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ fontFamily: fonts.display, fontSize: typeScale.largeTitle, letterSpacing: -0.8, color: colors.text }}>{exists ? "Welcome back" : "Create a password"}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: typeScale.subtitle, lineHeight: 24, color: colors.textSecondary }}>
                {exists ? "Signing in as " : "New account for "}
                <Text style={{ fontFamily: fonts.bodySemiBold, color: colors.text }}>{email}</Text>
              </Text>
            </View>

            <View style={inputBox(!!password)}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={exists ? "Password" : `At least ${MIN_PASSWORD_LENGTH} characters`}
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.tint}
                autoFocus
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={exists ? "current-password" : "new-password"}
                textContentType={exists ? "password" : "newPassword"}
                returnKeyType="go"
                onSubmitEditing={() => password.length >= MIN_PASSWORD_LENGTH && submit()}
                style={inputText}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={12}
                onPress={() => setShowPassword((v) => !v)}
                style={({ pressed }) => ({ paddingLeft: spacing.sm, opacity: pressed ? 0.5 : 1 })}
              >
                <Image source={showPassword ? "sf:eye.slash" : "sf:eye"} style={{ width: 22, height: 22, tintColor: colors.textSecondary }} />
              </Pressable>
            </View>

            {error ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: colors.danger }}>{error}</Text> : null}

            <View style={{ flex: 1 }} />
            <Button label={exists ? "Sign in" : "Create account"} fullWidth disabled={password.length < MIN_PASSWORD_LENGTH} loading={busy} onPress={submit} />
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
