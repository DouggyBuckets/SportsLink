import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/components/theme";
import { fonts } from "@/constants/theme";
import { DAY_SHORT, formatMinutes, GRID_DAYS, GRID_END_HOUR, GRID_START_HOUR, hasCell, toggleCell } from "@/lib/availability";

const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
const ROW_HEIGHT = 28;
const GUTTER = 38;

type Props = {
  cells: Set<string>;
  onChange: (cells: Set<string>) => void;
};

// When2meet-style weekly grid. Tap a cell to toggle it, or press and drag
// down a column to paint a whole afternoon in one gesture - the drag takes
// on whatever the first cell flipped to, so it can erase as well as fill.
export function AvailabilityGrid({ cells, onChange }: Props) {
  const { colors } = useAppTheme();
  // Latest cells for the responder callbacks, which outlive a render.
  const live = useRef(cells);
  useEffect(() => {
    live.current = cells;
  }, [cells]);
  const paint = useRef<{ day: number; on: boolean; last: number } | null>(null);

  const apply = (day: number, hour: number, on: boolean) => {
    if (hasCell(live.current, day, hour) === on) return;
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    const next = toggleCell(live.current, day, hour, on);
    live.current = next;
    onChange(next);
  };

  const hourAt = (y: number) => GRID_START_HOUR + Math.max(0, Math.min(HOURS.length - 1, Math.floor(y / ROW_HEIGHT)));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", marginLeft: GUTTER }}>
        {GRID_DAYS.map((day) => {
          const allOn = HOURS.every((h) => hasCell(cells, day, h));
          return (
            <Pressable
              key={day}
              accessibilityLabel={`Toggle all of ${DAY_SHORT[day]}`}
              hitSlop={4}
              style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
              onPress={() => {
                let next = cells;
                for (const h of HOURS) next = toggleCell(next, day, h, !allOn);
                if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
                onChange(next);
              }}
            >
              <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary }}>{DAY_SHORT[day]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row" }}>
        <View style={{ width: GUTTER }}>
          {HOURS.map((h) => (
            <View key={h} style={{ height: ROW_HEIGHT }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 10, color: colors.textTertiary, marginTop: -6, fontVariant: ["tabular-nums"] }}>{formatMinutes(h * 60)}</Text>
            </View>
          ))}
        </View>

        {GRID_DAYS.map((day) => (
          <View
            key={day}
            style={{ flex: 1, paddingHorizontal: 1.5 }}
            onStartShouldSetResponder={() => true}
            // Holding the responder keeps the parent ScrollView from stealing
            // the gesture mid-paint.
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              const hour = hourAt(e.nativeEvent.locationY);
              const on = !hasCell(live.current, day, hour);
              paint.current = { day, on, last: hour };
              apply(day, hour, on);
            }}
            onResponderMove={(e) => {
              const p = paint.current;
              if (!p) return;
              const hour = hourAt(e.nativeEvent.locationY);
              if (hour === p.last) return;
              const [from, to] = hour > p.last ? [p.last + 1, hour] : [hour, p.last - 1];
              for (let h = from; h <= to; h++) apply(p.day, h, p.on);
              p.last = hour;
            }}
            onResponderRelease={() => (paint.current = null)}
          >
            {HOURS.map((h) => {
              const on = hasCell(cells, day, h);
              const above = on && hasCell(cells, day, h - 1);
              const below = on && hasCell(cells, day, h + 1);
              return (
                <View key={h} pointerEvents="none" style={{ height: ROW_HEIGHT, paddingVertical: on ? 0 : 1.5 }}>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: on ? colors.maize : colors.fill,
                      borderTopLeftRadius: above ? 0 : 7,
                      borderTopRightRadius: above ? 0 : 7,
                      borderBottomLeftRadius: below ? 0 : 7,
                      borderBottomRightRadius: below ? 0 : 7,
                      marginTop: on && !above ? 1.5 : 0,
                      marginBottom: on && !below ? 1.5 : 0,
                    }}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const cell = (day: number, hour: number) => `${day}-${hour}`;

const WEEKDAYS = [1, 2, 3, 4, 5];
const span = (days: number[], from: number, to: number) => days.flatMap((d) => Array.from({ length: to - from }, (_, i) => cell(d, from + i)));

// One-tap starting points; students refine from there. Presets add to what's
// already selected, so "Weeknights" + "Weekends" composes.
export const AVAILABILITY_PRESETS: { label: string; cells: string[] }[] = [
  { label: "Mornings", cells: span(WEEKDAYS, 6, 9) },
  { label: "Afternoons", cells: span(WEEKDAYS, 12, 17) },
  { label: "Weeknights", cells: span(WEEKDAYS, 17, 22) },
  { label: "Weekends", cells: span([6, 0], 9, 21) },
];
