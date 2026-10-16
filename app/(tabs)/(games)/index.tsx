import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { GameCard } from "@/components/game-card";
import { useAppTheme } from "@/components/theme";
import { EmptyState, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderPill, HeaderRow } from "@/components/ui/header";
import { Screen } from "@/components/ui/screen";
import { spacing } from "@/constants/theme";
import { refreshGames } from "@/lib/api";
import { fitsSchedule, summarizeAvailability } from "@/lib/availability";
import { upcomingFeed } from "@/lib/selectors";
import { useAppStore } from "@/lib/store";

export default function Games() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const games = useAppStore((s) => s.games);
  const availability = useAppStore((s) => s.availability);
  const [refreshing, setRefreshing] = useState(false);

  const feed = useMemo(() => upcomingFeed(games), [games]);
  const fits = feed.filter((g) => fitsSchedule(g, availability));
  const others = feed.filter((g) => !fitsSchedule(g, availability));
  // Free time lives on the My schedule tab.
  const editSchedule = () => router.navigate("/schedule");

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshGames().catch(() => {});
    setRefreshing(false);
  };

  return (
    <>
      <StatusBar style="light" />
      <Screen
        header={
          <Header
            safeTop
            title="SportsLink"
            subtitle="Pickup soccer · Ann Arbor"
            right={<HeaderPill label="+ Post game" accessibilityLabel="Post a soccer game" onPress={() => router.push("/post-game")} />}
          >
            <HeaderRow
              icon="calendar.badge.clock"
              label="Your free time"
              value={availability.length ? summarizeAvailability(availability) : "Not set yet"}
              action={availability.length ? "Edit" : "Set"}
              onPress={editSchedule}
            />
          </Header>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        <SectionTitle title={availability.length ? "Games you can make" : "Open games"} />

        {fits.length > 0 ? (
          fits.map((g) => <GameCard key={g.id} game={g} fits />)
        ) : (
          <Card padding={0}>
            <EmptyState
              icon="calendar.badge.exclamationmark"
              title={availability.length ? "Nothing in your free time yet" : "When are you free?"}
              action={availability.length ? <Button label="Post a soccer game" icon="plus" variant="maize" size="md" onPress={() => router.push("/post-game")} /> : <Button label="Set free time" size="md" onPress={editSchedule} />}
            />
          </Card>
        )}

        {others.length > 0 ? (
          <>
            <View style={{ marginTop: spacing.sm }}>
              <SectionTitle title="Other times" />
            </View>
            {others.map((g) => (
              <GameCard key={g.id} game={g} fits={false} />
            ))}
          </>
        ) : null}
      </Screen>
    </>
  );
}
