import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { RefreshControl } from "react-native";
import { GameCard } from "@/components/game-card";
import { useAppTheme } from "@/components/theme";
import { EmptyState, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header, HeaderPill, HeaderRow } from "@/components/ui/header";
import { Screen } from "@/components/ui/screen";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { refreshGames } from "@/lib/api";
import { fitsSchedule, summarizeAvailability } from "@/lib/availability";
import { meetsMinimum } from "@/lib/reliability";
import { myStatus, upcomingFeed } from "@/lib/selectors";
import { useAppStore } from "@/lib/store";

export default function Games() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const games = useAppStore((s) => s.games);
  const availability = useAppStore((s) => s.availability);
  const me = useAppStore((s) => s.me);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"mine" | "all">("mine");

  // Games whose minimum reliability is above yours are hidden: you can't
  // join them, so they'd only clutter the list. Your own games always show.
  const feed = useMemo(() => upcomingFeed(games).filter((g) => !me || myStatus(g, me.id) !== null || meetsMinimum(me, g.minReliability)), [games, me]);
  const fits = feed.filter((g) => fitsSchedule(g, availability));
  const others = feed.filter((g) => !fitsSchedule(g, availability));
  // With no free time set there's nothing to filter by, so show everything.
  const showAll = view === "all" || availability.length === 0;
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
        {availability.length ? (
          <SegmentedTabs
            value={view}
            onChange={setView}
            options={[
              { value: "mine", label: "Fits my schedule" },
              { value: "all", label: "All games" },
            ]}
          />
        ) : null}

        {showAll ? (
          <>
            <SectionTitle title={availability.length ? "All upcoming games" : "Open games"} />
            {feed.length > 0 ? (
              feed.map((g) => <GameCard key={g.id} game={g} freeBadge={availability.length > 0 && fitsSchedule(g, availability)} />)
            ) : (
              <Card padding={0}>
                <EmptyState
                  icon="calendar.badge.exclamationmark"
                  title="No games yet"
                  action={<Button label="Post a soccer game" icon="plus" variant="maize" size="md" onPress={() => router.push("/post-game")} />}
                />
              </Card>
            )}
            {availability.length === 0 && feed.length > 0 ? (
              <Card padding={0}>
                <EmptyState icon="calendar.badge.clock" title="When are you free?" body="Set your free time to see the games you can make." action={<Button label="Set free time" size="md" onPress={editSchedule} />} />
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <SectionTitle title="Games you can make" />
            {fits.length > 0 ? (
              fits.map((g) => <GameCard key={g.id} game={g} fits />)
            ) : (
              <Card padding={0}>
                <EmptyState
                  icon="calendar.badge.exclamationmark"
                  title="Nothing in your free time yet"
                  body={others.length ? `${others.length} game${others.length === 1 ? "" : "s"} at other times.` : undefined}
                  action={
                    others.length ? (
                      <Button label="See all games" size="md" onPress={() => setView("all")} />
                    ) : (
                      <Button label="Post a soccer game" icon="plus" variant="maize" size="md" onPress={() => router.push("/post-game")} />
                    )
                  }
                />
              </Card>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
