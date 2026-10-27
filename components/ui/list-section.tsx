import * as Haptics from "expo-haptics";
import { Fragment } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export type ListRowData = {
  key: string;
  icon?: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  // Custom leading element (avatar etc.) instead of an SF Symbol tile.
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

// iOS inset-grouped list rendered on a card.
export function ListSection({ rows }: { rows: ListRowData[] }) {
  return (
    <Card padding={0}>
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 ? <Divider inset={row.icon || row.leading ? 56 : spacing.md} /> : null}
          <ListRow row={row} />
        </Fragment>
      ))}
    </Card>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useAppTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: inset }} />;
}

export function IconTile({ icon, color, size = 30 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        borderCurve: "continuous",
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={size * 0.52} color="#fff" />
    </View>
  );
}

export function ListRow({ row }: { row: ListRowData }) {
  const { colors } = useAppTheme();
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
        backgroundColor: pressed ? colors.fill : "transparent",
      }}
    >
      {row.leading ? row.leading : row.icon ? <IconTile icon={row.icon} color={row.iconColor ?? colors.tint} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.subtitle, color: row.destructive ? colors.danger : colors.text }}>
          {row.label}
        </Text>
        {row.sublabel ? (
          <Text style={{ fontFamily: fonts.body, fontSize: typeScale.label, color: colors.textTertiary, marginTop: 1 }}>{row.sublabel}</Text>
        ) : null}
      </View>
      {row.value ? (
        <Text style={{ fontFamily: fonts.body, fontSize: typeScale.subtitle, color: colors.textSecondary, fontVariant: ["tabular-nums"] }}>
          {row.value}
        </Text>
      ) : null}
      {row.trailing}
      {row.onPress ? <Icon name="chevron.right" size={12} color={colors.textTertiary} /> : null}
    </View>
  );

  if (!row.onPress) return content(false);
  return (
    <Pressable
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
        row.onPress?.();
      }}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}
