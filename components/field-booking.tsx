import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { setFieldBooking } from "@/lib/api";
import { fieldRules } from "@/lib/fields";
import { FieldBooking, Game } from "@/lib/types";

export const openReserveLink = (url: string) => (url.startsWith("http") ? WebBrowser.openBrowserAsync(url) : Linking.openURL(url));

export const bookingLabel = (status: FieldBooking, ref: string) =>
  status === "confirmed" ? `Reserved${ref ? ` · #${ref}` : ""}` : status === "requested" ? "Reservation requested" : "Not reserved";

// Asks for the rental/confirmation number, then saves "confirmed".
export function promptConfirmed(onSave: (ref: string) => void, current = "") {
  Alert.prompt("Field confirmed", "Add the confirmation or rental number from your approval so players can check it.", [
    { text: "Cancel", style: "cancel" },
    { text: "Save", onPress: (ref?: string) => onSave(ref ?? "") },
  ], "plain-text", current);
}

// The game page's "Field" row. Everyone sees whether the field is booked;
// the host can tap it to reserve and record the booking.
export function FieldBookingRow({ game, host }: { game: Game; host: boolean }) {
  const { colors } = useAppTheme();
  const rules = fieldRules(game.locationId);
  if (!rules) return null;
  const status = game.fieldBooking ?? "none";

  const save = (next: FieldBooking, ref = "") =>
    setFieldBooking(game.id, next, ref).catch((e) => Alert.alert("Couldn't update the booking", (e as Error).message));

  const manage = () => {
    const options = [
      { label: "Reserve this field", run: () => openReserveLink(rules.reserve.url) },
      ...(status !== "requested" ? [{ label: "I've requested it", run: () => save("requested", game.bookingRef) }] : []),
      { label: status === "confirmed" ? "Edit confirmation number" : "It's confirmed", run: () => promptConfirmed((ref) => save("confirmed", ref), game.bookingRef) },
      ...(status !== "none" ? [{ label: "Not reserved", run: () => save("none") }] : []),
    ];
    const labels = [...options.map((o) => o.label), "Cancel"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title: rules.reserve.note, options: labels, cancelButtonIndex: labels.length - 1 }, (i) => options[i]?.run());
    } else {
      Alert.alert("Field booking", rules.reserve.note, [...options.map((o) => ({ text: o.label, onPress: o.run })), { text: "Cancel", style: "cancel" as const }]);
    }
  };

  const tone = status === "confirmed" ? colors.success : status === "requested" ? colors.warning : colors.textTertiary;
  const icon = status === "confirmed" ? "checkmark.seal.fill" : status === "requested" ? "hourglass" : "calendar.badge.plus";
  const caption = status === "confirmed" ? "Host has the booking" : status === "requested" ? "Waiting on approval" : host ? "Tap to reserve it" : "Open play: booked events have priority";

  return (
    <Pressable
      disabled={!host}
      onPress={manage}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 })}
    >
      <Image source={`sf:${icon}`} style={{ width: 18, height: 18, tintColor: status === "none" ? colors.tint : tone }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>Field</Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: typeScale.body, color: status === "none" ? colors.text : tone }}>{bookingLabel(status, game.bookingRef)}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.caption, color: colors.textTertiary }}>{caption}</Text>
      </View>
      {host ? <Image source="sf:chevron.right" style={{ width: 8, height: 13, tintColor: colors.textTertiary }} /> : null}
    </Pressable>
  );
}
