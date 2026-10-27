import * as Haptics from "expo-haptics";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { useAppTheme } from "@/components/theme";
import { fonts, radius, spacing, typeScale } from "@/constants/theme";
import { reliabilityLabel, reliabilityTone } from "@/lib/reliability";
import { MiniProfile } from "@/lib/types";
import { Icon } from "@/components/ui/icon";

// Small shared pieces that don't earn their own file.

type ChipProps = { label: string; selected?: boolean; onPress?: () => void; icon?: string; iconColor?: string };

export function Chip({ label, selected, onPress, icon, iconColor }: ChipProps) {
  const { colors } = useAppTheme();
  const fg = selected ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.primary : colors.cardSolid,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.cardBorder,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? fg : (iconColor ?? fg)} /> : null}
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: fg }}>{label}</Text>
    </Pressable>
  );
}

type Tone = "success" | "warning" | "danger" | "neutral" | "maize" | "info";

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: string }) {
  const { colors } = useAppTheme();
  const tones: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    neutral: { bg: colors.fill, fg: colors.textSecondary },
    maize: { bg: colors.maize, fg: colors.onMaize },
    info: { bg: colors.tintSoft, fg: colors.tint },
  };
  const { bg, fg } = tones[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 12, color: fg }}>{label}</Text>
    </View>
  );
}

// "92% reliable" / "New player", colored by how reliable that is.
export function ReliabilityBadge({ user }: { user: Pick<MiniProfile, "reliability" | "ratedGames"> }) {
  return <Badge label={reliabilityLabel(user)} tone={reliabilityTone(user)} />;
}

const AVATAR_HUES = ["#0B3F73", "#2E9E5B", "#E8702A", "#7A5AF5", "#C9489B", "#12A5A5", "#52627A"];

const initials = (name: string, fallback: string) =>
  (name.trim() ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : fallback.slice(0, 2)).toUpperCase();

export function Avatar({ user, size = 40, ring }: { user: Pick<MiniProfile, "id" | "name" | "uniqname">; size?: number; ring?: string }) {
  const hue = AVATAR_HUES[[...user.id].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_HUES.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hue,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text style={{ color: "#fff", fontFamily: fonts.bodySemiBold, fontSize: size * 0.38 }}>{initials(user.name, user.uniqname)}</Text>
    </View>
  );
}

export function AvatarStack({ users, max = 4, size = 26 }: { users: MiniProfile[]; max?: number; size?: number }) {
  const { colors } = useAppTheme();
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((u, i) => (
        <View key={u.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar user={u} size={size} ring={colors.cardSolid} />
        </View>
      ))}
      {extra > 0 ? <Text style={{ marginLeft: 6, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary }}>+{extra}</Text> : null}
    </View>
  );
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: typeScale.title, color: colors.text, letterSpacing: -0.3 }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textSecondary }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.sectionLabel, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

export function Field({ style, ...rest }: TextInputProps) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      selectionColor={colors.tint}
      style={[
        {
          backgroundColor: colors.cardSolid,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: radius.md,
          borderCurve: "continuous",
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
          fontFamily: fonts.body,
          fontSize: typeScale.subtitle,
          color: colors.text,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function EmptyState({ icon, title, body, action, style }: { icon: string; title: string; body?: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg }, style]}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.xxs }}>
        <Icon name={icon} size={26} color={colors.tint} />
      </View>
      <Text style={{ fontFamily: fonts.heading, fontSize: typeScale.subtitle, color: colors.text, textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, color: colors.textSecondary, textAlign: "center", lineHeight: 21 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

// Header for modals and form sheets: title, optional subtitle, close button.
export function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text, letterSpacing: -0.5 }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: fonts.body, fontSize: typeScale.body, color: colors.textSecondary, lineHeight: 21 }}>{subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={10}
        onPress={onClose}
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="xmark" size={12} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}
