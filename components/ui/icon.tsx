import { Image } from "expo-image";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { ColorValue, View } from "react-native";

type AndroidSymbol = NonNullable<Extract<SymbolViewProps["name"], object>["android"]>;

// Every icon in the app is named by its SF Symbol. SF Symbols only exist on
// iOS, so Android draws the closest Material Symbol from this table instead.
// Adding an icon? Add its Material name here too (https://fonts.google.com/icons).
const MATERIAL: Record<string, AndroidSymbol> = {
  "arrow.counterclockwise": "restart_alt",
  "arrow.up.right": "open_in_new",
  calendar: "calendar_month",
  "calendar.badge.checkmark": "event_available",
  "calendar.badge.clock": "event_upcoming",
  "calendar.badge.exclamationmark": "event_busy",
  checklist: "checklist",
  checkmark: "check",
  "checkmark.circle.fill": "check_circle",
  "chevron.left": "chevron_left",
  "chevron.right": "chevron_right",
  circle: "radio_button_unchecked",
  clock: "schedule",
  "clock.arrow.circlepath": "history",
  ellipsis: "more_horiz",
  eye: "visibility",
  "eye.slash": "visibility_off",
  "info.circle": "info",
  "key.fill": "key",
  "mappin.and.ellipse": "location_on",
  pencil: "edit",
  person: "person",
  "person.2": "group",
  "person.crop.circle": "account_circle",
  "person.fill.checkmark": "how_to_reg",
  "person.slash": "person_off",
  plus: "add",
  "plus.circle.fill": "add_circle",
  "questionmark.circle": "help",
  "rectangle.portrait.and.arrow.right": "logout",
  soccerball: "sports_soccer",
  "text.bubble": "chat",
  "trash.fill": "delete",
  "wand.and.stars": "auto_awesome",
  xmark: "close",
};

export const materialIcon = (name: string): AndroidSymbol => MATERIAL[name] ?? "help";

// `style` is for nudging position only (margins), so it fits both renderers.
type IconProps = { name: string; size: number; color?: ColorValue; style?: { marginTop?: number } };

export function Icon({ name, size, color, style }: IconProps) {
  if (process.env.EXPO_OS === "ios") {
    return <Image source={`sf:${name}`} style={[{ width: size, height: size, tintColor: color as string }, style]} />;
  }
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <SymbolView name={{ android: materialIcon(name), web: materialIcon(name) }} size={size} tintColor={color} />
    </View>
  );
}
