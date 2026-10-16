import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { AVAILABILITY_PRESETS, AvailabilityGrid } from "@/components/availability-grid";
import { useAppTheme } from "@/components/theme";
import { Chip } from "@/components/ui/bits";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/ui/header";
import { Screen } from "@/components/ui/screen";
import { fonts, spacing, typeScale } from "@/constants/theme";
import { saveAvailability } from "@/lib/api";
import { blocksToCells, cellsToBlocks, weeklyFreeHours } from "@/lib/availability";
import { useAppStore } from "@/lib/store";

const SAVE_DELAY_MS = 700;

type SaveState = "saved" | "saving" | "error";

// The whole tab is the weekly free-time grid. Every tap or drag is saved
// automatically (debounced), so there's no Save button to forget.
export default function Schedule() {
  const { colors } = useAppTheme();
  const saved = useAppStore((s) => s.availability);
  const [cells, setCells] = useState(() => blocksToCells(saved));
  const [state, setState] = useState<SaveState>("saved");
  const savedKey = useRef(JSON.stringify(saved));
  const blocks = cellsToBlocks(cells);

  useEffect(() => {
    const next = cellsToBlocks(cells);
    const key = JSON.stringify(next);
    if (key === savedKey.current) return;
    setState("saving");
    const t = setTimeout(() => {
      saveAvailability(next)
        .then(() => {
          savedKey.current = key;
          setState("saved");
        })
        .catch(() => setState("error"));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [cells]);

  const status = state === "saving" ? "Saving…" : state === "error" ? "Couldn't save - tap a cell to retry" : `${weeklyFreeHours(blocks)} free hours a week · Saved`;

  return (
    <Screen header={<Header safeTop title="My schedule" subtitle="Tap or drag the hours you're free" />}>
      <StatusBar style="light" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {AVAILABILITY_PRESETS.map((p) => (
          <Chip key={p.label} label={p.label} icon="wand.and.stars" onPress={() => setCells(new Set([...cells, ...p.cells]))} />
        ))}
        {cells.size > 0 ? <Chip label="Clear" icon="xmark" onPress={() => setCells(new Set())} /> : null}
      </View>
      <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: typeScale.label, color: state === "error" ? colors.danger : colors.textSecondary }}>{status}</Text>
      <Card padding={spacing.sm}>
        <AvailabilityGrid cells={cells} onChange={setCells} />
      </Card>
    </Screen>
  );
}
