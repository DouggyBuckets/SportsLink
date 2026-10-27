import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { BLUE, fonts, MAIZE, spacing } from "@/constants/theme";
import { DEMO } from "@/lib/supabase";
import { Icon } from "@/components/ui/icon";

const POINTS = [
  { icon: "calendar.badge.checkmark", title: "Games that fit your schedule", body: "Tell us when you're free and we'll show the pickup games you can actually make." },
  { icon: "person.fill.checkmark", title: "Players who show up", body: "Every player has a reliability score. Hosts can require a minimum, so games actually happen." },
  { icon: "plus.circle.fill", title: "Post a game in seconds", body: "Pick a field and a time. Players free then see it first." },
];

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BLUE, paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg, paddingHorizontal: spacing.xl }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, justifyContent: "flex-end", gap: spacing.xl }}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ gap: spacing.xs }}>
          <View style={{ width: 44, height: 5, backgroundColor: MAIZE, marginBottom: spacing.sm }} />
          <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: 1.5, color: MAIZE }}>FOR U-M STUDENTS</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 44, letterSpacing: -1.2, color: "#fff" }}>SportsLink</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 18, lineHeight: 26, color: "rgba(255,255,255,0.8)" }}>Pickup soccer with players who actually show up.</Text>
        </Animated.View>

        <View style={{ gap: spacing.md }}>
          {POINTS.map((p, i) => (
            <Animated.View key={p.title} entering={FadeInDown.delay(120 + i * 80).duration(400)} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <Icon name={p.icon} size={22} color={MAIZE} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 16, color: "#fff" }}>{p.title}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.7)" }}>{p.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={{ gap: spacing.sm }}>
          <Button label="Continue with your umich email" variant="maize" fullWidth onPress={() => router.push("/login")} />
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
            {DEMO ? "Demo mode - no backend connected" : "Students only - sign in with your umich.edu uniqname."}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
